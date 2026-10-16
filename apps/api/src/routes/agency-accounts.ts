import { createHash } from "node:crypto";
import type pg from "pg";
import { Router, type Request } from "express";
import { withTransaction, type AuthPrincipal } from "@platform/database";
import { uuidV7 } from "@platform/runtime";
import { z } from "zod";
import { HttpError } from "../http/error";
import { authenticatedPrincipal, requireAuthentication } from "../security/auth";
import { assertAuthorized } from "../security/rbac";

const publicId = z.string().uuid();
const safeIdempotencyKey = /^[A-Za-z0-9._:-]{8,128}$/;
const moneyInput = z.string().trim().regex(/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,2})?$/);
const priceSchema = z.discriminatedUnion("active", [
  z.object({ cylinderTypeCode: z.string().trim().min(1).max(64), active: z.literal(true), unitPrice: moneyInput, reason: z.string().trim().min(3).max(500) }).strict(),
  z.object({ cylinderTypeCode: z.string().trim().min(1).max(64), active: z.literal(false), reason: z.string().trim().min(3).max(500) }).strict(),
]);
const creditPolicySchema = z.object({ creditEnabled: z.boolean(), reason: z.string().trim().min(3).max(500) }).strict();
const collectionSchema = z.object({
  amount: moneyInput,
  paymentMethod: z.enum(["cash", "upi", "bank_transfer", "cheque", "other"]),
  reference: z.string().trim().min(3).max(120).optional(),
  note: z.string().trim().min(3).max(500).optional(),
  receivedAt: z.string().datetime({ offset: true }).optional(),
}).strict();

interface AgencyRow {
  id: string;
  public_id: string;
  display_name: string;
  city: string;
  credit_enabled: boolean;
}

interface AccountRow {
  id: string;
  public_id: string;
  status: string;
  payment_mode: string;
  tenant_id: string;
  tenant_public_id: string;
  tenant_display_name: string;
  sort_name: string;
  tenant_legal_name: string;
  tenant_gstin: string;
  tenant_business_type: string;
  credit_status: string | null;
  credit_limit: string | null;
  net_term_days: number | null;
  outstanding_amount: string;
  overdue_amount: string;
  open_invoice_count: number;
  collected_amount: string;
  last_payment_at: Date | null;
  prices: Array<{
    cylinderTypeCode: string;
    displayName: string;
    baseUnitPrice: string;
    negotiatedUnitPrice: string | null;
    negotiatedActive: boolean;
  }>;
}

interface PaymentRow {
  id: string;
  public_id: string;
  amount: string;
  payment_method: string;
  reference: string | null;
  note: string | null;
  received_at: Date;
  created_at: Date;
  account_public_id: string;
  tenant_public_id: string;
  tenant_display_name: string;
  recorded_by_name: string;
  allocations: Array<{ invoicePublicId: string; invoiceNumber: string; amount: string }>;
}

interface IdempotencyReplay {
  status: number;
  body: unknown;
  replayed: boolean;
}

function actorRoles(principal: AuthPrincipal): string {
  return [...new Set(principal.assignments.map((assignment) => assignment.roleType))].join(",");
}

function toPaise(value: string | number): number {
  const paise = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(paise)) throw new HttpError(422, "invalid_money_value", "The money value exceeds the supported range.");
  return paise;
}

function money(paise: number): string {
  return (paise / 100).toFixed(2);
}

function requestHash(body: unknown): Buffer {
  return createHash("sha256").update(JSON.stringify(body), "utf8").digest();
}

function idempotencyKey(request: Request): string {
  const key = request.header("idempotency-key")?.trim();
  if (!key || !safeIdempotencyKey.test(key)) {
    throw new HttpError(400, "invalid_idempotency_key", "Idempotency-Key must contain 8–128 safe characters.");
  }
  return key;
}

async function claimIdempotency(
  client: pg.PoolClient,
  scope: string,
  key: string,
  hash: Buffer,
): Promise<IdempotencyReplay | null> {
  const claimed = await client.query(
    `insert into app.idempotency_keys (scope, idempotency_key, request_hash, locked_until, expires_at)
     values ($1, $2, $3, now() + interval '30 seconds', now() + interval '24 hours')
     on conflict (scope, idempotency_key) do nothing`,
    [scope, key, hash],
  );
  if (claimed.rowCount !== 0) return null;

  const prior = (
    await client.query<{ same_request: boolean; response_status: number | null; response_body: unknown }>(
      `select request_hash = $3 as same_request, response_status, response_body
         from app.idempotency_keys where scope = $1 and idempotency_key = $2 for update`,
      [scope, key, hash],
    )
  ).rows[0];
  if (!prior?.same_request) throw new HttpError(409, "idempotency_key_reused", "This idempotency key was already used for another request.");
  if (prior.response_status && prior.response_body) return { status: prior.response_status, body: prior.response_body, replayed: true };
  throw new HttpError(409, "request_in_progress", "This request is still in progress.");
}

async function completeIdempotency(client: pg.PoolClient, scope: string, key: string, status: number, body: unknown): Promise<void> {
  await client.query(
    `update app.idempotency_keys set response_status = $3, response_body = $4::jsonb,
            completed_at = now(), locked_until = null where scope = $1 and idempotency_key = $2`,
    [scope, key, status, JSON.stringify(body)],
  );
}

async function agencyContext(
  client: pg.Pool | pg.PoolClient,
  principal: AuthPrincipal,
  agencyPublicId: string,
  permission: string,
): Promise<AgencyRow> {
  const agency = (
    await client.query<AgencyRow>(
      `select id::text, public_id::text, display_name, city, credit_enabled
         from app.agencies where public_id = $1 and status = 'approved'`,
      [agencyPublicId],
    )
  ).rows[0];
  if (!agency) throw new HttpError(404, "agency_not_found", "The agency was not found or is unavailable.");
  assertAuthorized(principal, permission, { agencyPublicId: agency.public_id, city: agency.city });
  return agency;
}

async function accountContext(
  client: pg.Pool | pg.PoolClient,
  agencyId: string,
  accountPublicId: string,
  lock = false,
): Promise<{ id: string; public_id: string; status: string; agency_id: string; tenant_id: string; tenant_public_id: string; tenant_display_name: string }> {
  const row = (
    await client.query<{ id: string; public_id: string; status: string; agency_id: string; tenant_id: string; tenant_public_id: string; tenant_display_name: string }>(
      `select account.id::text, account.public_id::text, account.status,
              account.agency_id::text, account.tenant_id::text,
              tenant.public_id::text as tenant_public_id, tenant.display_name as tenant_display_name
         from app.commercial_accounts account
         join app.tenants tenant on tenant.id = account.tenant_id
        where account.agency_id = $1 and account.public_id = $2
        ${lock ? "for update of account" : ""}`,
      [agencyId, accountPublicId],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, "commercial_account_not_found", "The commercial account was not found for this agency.");
  return row;
}

function decodeCursor(raw: unknown): { name: string; publicId: string } | null {
  if (raw === undefined || raw === "") return null;
  if (typeof raw !== "string" || raw.length > 500) throw new HttpError(400, "invalid_cursor", "The account cursor is invalid.");
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    const checked = z.object({ name: z.string().max(300), publicId }).strict().safeParse(parsed);
    if (!checked.success) throw new Error("invalid cursor payload");
    return checked.data;
  } catch {
    throw new HttpError(400, "invalid_cursor", "The account cursor is invalid.");
  }
}

function encodeCursor(row: AccountRow): string {
  return Buffer.from(JSON.stringify({ name: row.sort_name, publicId: row.public_id }), "utf8").toString("base64url");
}

function accountResponse(row: AccountRow) {
  return {
    publicId: row.public_id,
    status: row.status,
    paymentMode: row.payment_mode,
    tenant: {
      publicId: row.tenant_public_id,
      displayName: row.tenant_display_name,
      legalName: row.tenant_legal_name,
      gstin: row.tenant_gstin,
      businessType: row.tenant_business_type,
    },
    credit: row.credit_status ? { status: row.credit_status, limit: row.credit_limit, netTermDays: row.net_term_days } : null,
    receivables: {
      outstanding: row.outstanding_amount,
      overdue: row.overdue_amount,
      openInvoiceCount: row.open_invoice_count,
    },
    collections: { total: row.collected_amount, lastReceivedAt: row.last_payment_at?.toISOString() ?? null },
    prices: row.prices,
  };
}

function paymentResponse(row: PaymentRow) {
  return {
    publicId: row.public_id,
    amount: row.amount,
    paymentMethod: row.payment_method,
    reference: row.reference,
    note: row.note,
    receivedAt: row.received_at.toISOString(),
    recordedAt: row.created_at.toISOString(),
    recordedBy: row.recorded_by_name,
    account: { publicId: row.account_public_id },
    tenant: { publicId: row.tenant_public_id, displayName: row.tenant_display_name },
    allocations: row.allocations,
  };
}

async function paymentView(client: pg.Pool | pg.PoolClient, agencyId: string, paymentPublicId: string): Promise<ReturnType<typeof paymentResponse>> {
  const row = (
    await client.query<PaymentRow>(
      `select payment.id::text, payment.public_id::text, payment.amount::text,
              payment.payment_method, payment.reference, payment.note,
              payment.received_at, payment.created_at, account.public_id::text as account_public_id,
              tenant.public_id::text as tenant_public_id, tenant.display_name as tenant_display_name,
              recorder.full_name as recorded_by_name,
              coalesce(allocation_rows.value, '[]'::jsonb) as allocations
         from app.payment_collections payment
         join app.commercial_accounts account on account.id = payment.commercial_account_id
         join app.tenants tenant on tenant.id = payment.tenant_id
         join app.users recorder on recorder.id = payment.recorded_by_user_id
         left join lateral (
           select jsonb_agg(jsonb_build_object(
                    'invoicePublicId', invoice.public_id::text,
                    'invoiceNumber', invoice.invoice_number,
                    'amount', allocation.amount::text
                  ) order by invoice.issued_at, invoice.id) as value
             from app.payment_allocations allocation
             join app.invoices invoice on invoice.id = allocation.invoice_id
            where allocation.payment_collection_id = payment.id
         ) allocation_rows on true
        where payment.agency_id = $1 and payment.public_id = $2`,
      [agencyId, paymentPublicId],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, "payment_not_found", "The payment collection was not found for this agency.");
  return paymentResponse(row);
}

async function recordAudit(
  client: pg.PoolClient,
  request: Request,
  principal: AuthPrincipal,
  action: string,
  entityType: string,
  entityPublicId: string,
  reason: string | null,
  beforeValues: unknown,
  afterValues: unknown,
): Promise<void> {
  await client.query(
    `insert into app.audit_events (
       public_id, actor_user_id, actor_role, action, entity_type, entity_public_id,
       reason, before_values, after_values, request_id, correlation_id, source_ip, user_agent
     ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13)`,
    [uuidV7(), principal.userId, actorRoles(principal), action, entityType, entityPublicId, reason,
      beforeValues === null ? null : JSON.stringify(beforeValues), afterValues === null ? null : JSON.stringify(afterValues),
      uuidV7(), uuidV7(), request.ip || null, request.header("user-agent")?.slice(0, 500) ?? null],
  );
}

export function agencyAccountsRouter(options: { pool: pg.Pool; tokenPepper: string }): Router {
  const router = Router();
  router.use(requireAuthentication(options));

  router.get("/agencies/:agencyPublicId/accounts", async (request, response, next) => {
    try {
      const agencyId = publicId.safeParse(request.params.agencyPublicId);
      const limit = z.coerce.number().int().min(1).max(100).default(50).safeParse(request.query.limit ?? 50);
      if (!agencyId.success || !limit.success) throw new HttpError(400, "invalid_request", "The agency identifier or page size is invalid.");
      const cursor = decodeCursor(request.query.cursor);
      const principal = authenticatedPrincipal(response);
      const agency = await agencyContext(options.pool, principal, agencyId.data, "agency.view");
      const result = await options.pool.query<AccountRow>(
        `select account.id::text, account.public_id::text, account.status, account.payment_mode,
                tenant.id::text as tenant_id, tenant.public_id::text as tenant_public_id,
                tenant.display_name as tenant_display_name, lower(tenant.display_name) as sort_name,
                tenant.legal_name as tenant_legal_name,
                tenant.gstin as tenant_gstin, tenant.business_type as tenant_business_type,
                credit.status as credit_status, credit.credit_limit::text, credit.net_term_days,
                coalesce(receivables.outstanding_amount, 0)::numeric(14, 2)::text as outstanding_amount,
                coalesce(receivables.overdue_amount, 0)::numeric(14, 2)::text as overdue_amount,
                coalesce(receivables.open_invoice_count, 0)::int as open_invoice_count,
                coalesce(collections.collected_amount, 0)::numeric(14, 2)::text as collected_amount,
                collections.last_payment_at,
                coalesce(price_rows.value, '[]'::jsonb) as prices
           from app.commercial_accounts account
           join app.tenants tenant on tenant.id = account.tenant_id
           left join app.credit_accounts credit on credit.commercial_account_id = account.id
           left join lateral (
             select sum(invoice.outstanding_amount) as outstanding_amount,
                    sum(invoice.outstanding_amount) filter (where invoice.due_at < now()) as overdue_amount,
                    count(*) as open_invoice_count
               from app.invoices invoice
              where invoice.commercial_account_id = account.id
                and invoice.status in ('open', 'overdue') and invoice.outstanding_amount > 0
           ) receivables on true
           left join lateral (
             select sum(payment.amount) as collected_amount, max(payment.received_at) as last_payment_at
               from app.payment_collections payment where payment.commercial_account_id = account.id
           ) collections on true
           left join lateral (
             select jsonb_agg(jsonb_build_object(
                      'cylinderTypeCode', cylinder.code,
                      'displayName', cylinder.display_name,
                      'baseUnitPrice', agency_price.base_unit_price::text,
                      'negotiatedUnitPrice', negotiated.unit_price::text,
                      'negotiatedActive', coalesce(negotiated.active, false)
                    ) order by cylinder.weight_kg, cylinder.code) as value
               from app.agency_prices agency_price
               join app.cylinder_types cylinder on cylinder.id = agency_price.cylinder_type_id and cylinder.active
               left join app.commercial_account_prices negotiated
                 on negotiated.commercial_account_id = account.id
                and negotiated.cylinder_type_id = cylinder.id
              where agency_price.agency_id = account.agency_id and agency_price.active
           ) price_rows on true
          where account.agency_id = $1
            and account.status in ('open', 'suspended')
            and ($2::text is null or (lower(tenant.display_name), account.public_id) > ($2, $3::uuid))
          order by lower(tenant.display_name), account.public_id
          limit $4`,
        [agency.id, cursor?.name ?? null, cursor?.publicId ?? null, limit.data + 1],
      );
      const page = result.rows.slice(0, limit.data);
      response.status(200).json({
        agency: { publicId: agency.public_id, displayName: agency.display_name, creditEnabled: agency.credit_enabled },
        accounts: page.map(accountResponse),
        nextCursor: result.rows.length > limit.data && page.length ? encodeCursor(page[page.length - 1]!) : null,
      });
    } catch (error) { next(error); }
  });

  router.get("/agencies/:agencyPublicId/payments", async (request, response, next) => {
    try {
      const agencyId = publicId.safeParse(request.params.agencyPublicId);
      const limit = z.coerce.number().int().min(1).max(100).default(50).safeParse(request.query.limit ?? 50);
      if (!agencyId.success || !limit.success) throw new HttpError(400, "invalid_request", "The agency identifier or page size is invalid.");
      const principal = authenticatedPrincipal(response);
      const agency = await agencyContext(options.pool, principal, agencyId.data, "payment.view");
      const rows = await options.pool.query<PaymentRow>(
        `select payment.id::text, payment.public_id::text, payment.amount::text,
                payment.payment_method, payment.reference, payment.note,
                payment.received_at, payment.created_at, account.public_id::text as account_public_id,
                tenant.public_id::text as tenant_public_id, tenant.display_name as tenant_display_name,
                recorder.full_name as recorded_by_name,
                coalesce(allocation_rows.value, '[]'::jsonb) as allocations
           from app.payment_collections payment
           join app.commercial_accounts account on account.id = payment.commercial_account_id
           join app.tenants tenant on tenant.id = payment.tenant_id
           join app.users recorder on recorder.id = payment.recorded_by_user_id
           left join lateral (
             select jsonb_agg(jsonb_build_object(
                      'invoicePublicId', invoice.public_id::text,
                      'invoiceNumber', invoice.invoice_number,
                      'amount', allocation.amount::text
                    ) order by invoice.issued_at, invoice.id) as value
               from app.payment_allocations allocation
               join app.invoices invoice on invoice.id = allocation.invoice_id
              where allocation.payment_collection_id = payment.id
           ) allocation_rows on true
          where payment.agency_id = $1
          order by payment.received_at desc, payment.id desc limit $2`,
        [agency.id, limit.data],
      );
      response.status(200).json({ payments: rows.rows.map(paymentResponse) });
    } catch (error) { next(error); }
  });

  router.post("/agencies/:agencyPublicId/credit-policy", async (request, response, next) => {
    try {
      const agencyId = publicId.safeParse(request.params.agencyPublicId);
      const parsed = creditPolicySchema.safeParse(request.body);
      if (!agencyId.success || !parsed.success) throw new HttpError(400, "invalid_request", "The agency credit policy request is invalid.", parsed.success ? undefined : parsed.error.flatten());
      const key = idempotencyKey(request);
      const principal = authenticatedPrincipal(response);
      const scope = `agency.credit-policy:${principal.userPublicId}:${agencyId.data}`;
      const hash = requestHash(parsed.data);
      const result = await withTransaction(options.pool, async (client): Promise<IdempotencyReplay> => {
        const agency = await agencyContext(client, principal, agencyId.data, "agency.edit");
        const replay = await claimIdempotency(client, scope, key, hash);
        if (replay) return replay;
        await client.query("select id from app.agencies where id = $1 for update", [agency.id]);
        const current = (await client.query<{ credit_enabled: boolean }>("select credit_enabled from app.agencies where id = $1", [agency.id])).rows[0]!;
        await client.query("update app.agencies set credit_enabled = $2, updated_at = now() where id = $1", [agency.id, parsed.data.creditEnabled]);
        const body = { agency: { publicId: agency.public_id, displayName: agency.display_name, creditEnabled: parsed.data.creditEnabled } };
        await recordAudit(client, request, principal, "agency.credit_availability_changed", "agency", agency.public_id, parsed.data.reason, { creditEnabled: current.credit_enabled }, { creditEnabled: parsed.data.creditEnabled });
        await completeIdempotency(client, scope, key, 200, body);
        return { status: 200, body, replayed: false };
      });
      if (result.replayed) response.setHeader("idempotent-replayed", "true");
      response.status(result.status).json(result.body);
    } catch (error) { next(error); }
  });

  router.post("/agencies/:agencyPublicId/accounts/:accountPublicId/prices", async (request, response, next) => {
    try {
      const agencyId = publicId.safeParse(request.params.agencyPublicId);
      const accountId = publicId.safeParse(request.params.accountPublicId);
      const parsed = priceSchema.safeParse(request.body);
      if (!agencyId.success || !accountId.success || !parsed.success) throw new HttpError(400, "invalid_request", "The negotiated-price request is invalid.", parsed.success ? undefined : parsed.error.flatten());
      const key = idempotencyKey(request);
      const principal = authenticatedPrincipal(response);
      const scope = `agency.account-price:${principal.userPublicId}:${agencyId.data}:${accountId.data}:${parsed.data.cylinderTypeCode}`;
      const hash = requestHash(parsed.data);
      const result = await withTransaction(options.pool, async (client): Promise<IdempotencyReplay> => {
        const agency = await agencyContext(client, principal, agencyId.data, "agency.edit");
        const replay = await claimIdempotency(client, scope, key, hash);
        if (replay) return replay;
        const account = await accountContext(client, agency.id, accountId.data, true);
        if (account.status !== "open") throw new HttpError(409, "commercial_account_unavailable", "Negotiated pricing can only be changed for an open commercial account.");
        const catalogPrice = (
          await client.query<{ cylinder_type_id: string; display_name: string; base_unit_price: string }>(
            `select cylinder.id::text as cylinder_type_id, cylinder.display_name, price.base_unit_price::text
               from app.agency_prices price
               join app.cylinder_types cylinder on cylinder.id = price.cylinder_type_id and cylinder.active
              where price.agency_id = $1 and cylinder.code = $2 and price.active
              for update of price`,
            [agency.id, parsed.data.cylinderTypeCode],
          )
        ).rows[0];
        if (!catalogPrice) throw new HttpError(422, "catalog_price_unavailable", "This cylinder type is not active in the agency catalogue.");
        const previous = (
          await client.query<{ public_id: string; unit_price: string; active: boolean }>(
            `select public_id::text, unit_price::text, active from app.commercial_account_prices
              where commercial_account_id = $1 and cylinder_type_id = $2 for update`,
            [account.id, catalogPrice.cylinder_type_id],
          )
        ).rows[0] ?? null;

        let pricePublicId = previous?.public_id ?? uuidV7();
        let unitPrice: string | null = previous?.unit_price ?? null;
        if (parsed.data.active) {
          const negotiatedPaise = toPaise(parsed.data.unitPrice);
          if (negotiatedPaise > toPaise(catalogPrice.base_unit_price)) {
            throw new HttpError(422, "negotiated_price_above_catalogue", "A negotiated price cannot exceed the active agency catalogue price.");
          }
          unitPrice = money(negotiatedPaise);
          const saved = (
            await client.query<{ public_id: string }>(
              `insert into app.commercial_account_prices (
                 public_id, commercial_account_id, cylinder_type_id, unit_price, active, set_by_user_id, reason
               ) values ($1, $2, $3, $4, true, $5, $6)
               on conflict (commercial_account_id, cylinder_type_id) do update
                 set unit_price = excluded.unit_price, active = true, set_by_user_id = excluded.set_by_user_id,
                     reason = excluded.reason, updated_at = now()
               returning public_id::text`,
              [pricePublicId, account.id, catalogPrice.cylinder_type_id, unitPrice, principal.userId, parsed.data.reason],
            )
          ).rows[0]!;
          pricePublicId = saved.public_id;
        } else {
          if (!previous) throw new HttpError(404, "negotiated_price_not_found", "There is no negotiated price to disable for this cylinder type.");
          await client.query(
            `update app.commercial_account_prices
                set active = false, set_by_user_id = $2, reason = $3, updated_at = now()
              where commercial_account_id = $1 and cylinder_type_id = $4`,
            [account.id, principal.userId, parsed.data.reason, catalogPrice.cylinder_type_id],
          );
        }
        const body = { price: { publicId: pricePublicId, cylinderTypeCode: parsed.data.cylinderTypeCode, displayName: catalogPrice.display_name, baseUnitPrice: catalogPrice.base_unit_price, unitPrice, active: parsed.data.active } };
        await recordAudit(client, request, principal, "account.negotiated_price_changed", "commercial_account", account.public_id, parsed.data.reason,
          previous ? { cylinderTypeCode: parsed.data.cylinderTypeCode, unitPrice: previous.unit_price, active: previous.active } : null,
          { cylinderTypeCode: parsed.data.cylinderTypeCode, unitPrice, active: parsed.data.active });
        await completeIdempotency(client, scope, key, 200, body);
        return { status: 200, body, replayed: false };
      });
      if (result.replayed) response.setHeader("idempotent-replayed", "true");
      response.status(result.status).json(result.body);
    } catch (error) { next(error); }
  });

  router.post("/agencies/:agencyPublicId/accounts/:accountPublicId/payments", async (request, response, next) => {
    try {
      const agencyId = publicId.safeParse(request.params.agencyPublicId);
      const accountId = publicId.safeParse(request.params.accountPublicId);
      const parsed = collectionSchema.safeParse(request.body);
      if (!agencyId.success || !accountId.success || !parsed.success) throw new HttpError(400, "invalid_request", "The payment collection request is invalid.", parsed.success ? undefined : parsed.error.flatten());
      const key = idempotencyKey(request);
      const principal = authenticatedPrincipal(response);
      const scope = `agency.payment:${principal.userPublicId}:${agencyId.data}:${accountId.data}`;
      const hash = requestHash(parsed.data);
      const result = await withTransaction(options.pool, async (client): Promise<IdempotencyReplay> => {
        const agency = await agencyContext(client, principal, agencyId.data, "payment.create");
        const replay = await claimIdempotency(client, scope, key, hash);
        if (replay) return replay;
        const account = await accountContext(client, agency.id, accountId.data, true);
        if (account.status === "closed") throw new HttpError(409, "commercial_account_unavailable", "Payments cannot be recorded for a closed commercial account.");
        const invoices = (
          await client.query<{ id: string; public_id: string; invoice_number: string; outstanding_amount: string }>(
            `select id::text, public_id::text, invoice_number, outstanding_amount::text
               from app.invoices
              where commercial_account_id = $1
                and status in ('open', 'overdue') and outstanding_amount > 0
              order by due_at asc nulls last, issued_at, id
              for update`,
            [account.id],
          )
        ).rows;
        const amountPaise = toPaise(parsed.data.amount);
        const outstandingPaise = invoices.reduce((sum, invoice) => sum + toPaise(invoice.outstanding_amount), 0);
        if (outstandingPaise === 0) throw new HttpError(422, "no_outstanding_invoices", "This account has no outstanding invoice to settle.");
        if (amountPaise > outstandingPaise) {
          throw new HttpError(422, "payment_exceeds_outstanding", "The collection exceeds this account’s outstanding invoices. Record only the invoice-settlement amount.", { outstandingAmount: money(outstandingPaise) });
        }
        const receivedAt = parsed.data.receivedAt ? new Date(parsed.data.receivedAt) : new Date();
        if (receivedAt.getTime() > Date.now() + 5 * 60_000) throw new HttpError(422, "payment_received_at_future", "The payment received time cannot be in the future.");
        const paymentPublicId = uuidV7();
        const payment = (
          await client.query<{ id: string }>(
            `insert into app.payment_collections (
               public_id, commercial_account_id, agency_id, tenant_id, amount, payment_method,
               reference, note, received_at, recorded_by_user_id
             ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             returning id::text`,
            [paymentPublicId, account.id, agency.id, account.tenant_id, money(amountPaise), parsed.data.paymentMethod,
              parsed.data.reference ?? null, parsed.data.note ?? null, receivedAt, principal.userId],
          )
        ).rows[0]!;
        let remaining = amountPaise;
        const allocations: Array<{ invoicePublicId: string; invoiceNumber: string; amount: string }> = [];
        for (const invoice of invoices) {
          if (remaining === 0) break;
          const invoiceOutstanding = toPaise(invoice.outstanding_amount);
          const applied = Math.min(remaining, invoiceOutstanding);
          const newOutstanding = invoiceOutstanding - applied;
          await client.query(
            `insert into app.payment_allocations (payment_collection_id, invoice_id, amount)
             values ($1, $2, $3)`,
            [payment.id, invoice.id, money(applied)],
          );
          await client.query(
            `update app.invoices
                set outstanding_amount = $2,
                    status = case when $2::numeric = 0 then 'paid' else status end,
                    paid_at = case when $2::numeric = 0 then now() else paid_at end,
                    updated_at = now()
              where id = $1`,
            [invoice.id, money(newOutstanding)],
          );
          if (newOutstanding === 0) {
            await client.query(
              `update app.orders set payment_status = 'paid', updated_at = now()
                where id = (select order_id from app.invoices where id = $1)`,
              [invoice.id],
            );
          }
          allocations.push({ invoicePublicId: invoice.public_id, invoiceNumber: invoice.invoice_number, amount: money(applied) });
          remaining -= applied;
        }
        if (remaining !== 0) throw new HttpError(409, "payment_allocation_failed", "The payment could not be fully allocated.");
        const body = { payment: await paymentView(client, agency.id, paymentPublicId) };
        await client.query(
          `insert into app.outbox_events (public_id, event_type, aggregate_type, aggregate_public_id, payload, dedupe_key)
           values ($1, 'payment.recorded', 'payment_collection', $2, $3::jsonb, $4)`,
          [uuidV7(), paymentPublicId, JSON.stringify({ paymentPublicId, agencyPublicId: agency.public_id, tenantPublicId: account.tenant_public_id, commercialAccountPublicId: account.public_id, amount: money(amountPaise), paymentMethod: parsed.data.paymentMethod, allocations }), `payment-recorded:${paymentPublicId}`],
        );
        await recordAudit(client, request, principal, "payment.recorded", "payment_collection", paymentPublicId, parsed.data.note ?? parsed.data.reference ?? "Agency payment collection recorded", null,
          { commercialAccountPublicId: account.public_id, tenantPublicId: account.tenant_public_id, amount: money(amountPaise), paymentMethod: parsed.data.paymentMethod, allocations });
        await completeIdempotency(client, scope, key, 201, body);
        return { status: 201, body, replayed: false };
      });
      if (result.replayed) response.setHeader("idempotent-replayed", "true");
      response.status(result.status).json(result.body);
    } catch (error) { next(error); }
  });

  return router;
}
