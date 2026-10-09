import { randomBytes } from "node:crypto";
import type pg from "pg";
import { Router } from "express";
import { loadPrincipalBySessionHash, withTransaction } from "@platform/database";
import { decryptSecret, encryptSecret, uuidV7 } from "@platform/runtime";
import { z } from "zod";
import type { ApiConfig } from "../config";
import { activeAgencyAccess } from "../domain/agency-access";
import { platformAccessFromAssignments } from "../domain/platform-access";
import { HttpError } from "../http/error";
import { generateRecoveryCodes, generateTotpSecret, hashMfaValue, normalizeRecoveryCode, totpUri, verifyTotp } from "../security/mfa";
import { hashSessionToken } from "../security/token";

const ticket = z.string().min(32).max(512);
const enrollSchema = z.object({ mfaTicket: ticket, label: z.string().trim().min(2).max(120).default("Authenticator app") }).strict();
const enrollmentVerifySchema = z.object({ mfaTicket: ticket, factorPublicId: z.string().uuid(), code: z.string().regex(/^[0-9]{6}$/) }).strict();
const verifySchema = z.object({ mfaTicket: ticket, code: z.string().trim().min(6).max(20) }).strict();

interface TicketRow { id: string; public_id: string; user_id: string; user_public_id: string; full_name: string; phone_e164: string; attempts_remaining: number; device_name: string | null; device_identifier_hash: Buffer | null; created_ip: string | null; }
interface FactorRow { id: string; public_id: string; secret_envelope: string; status: "pending" | "active"; last_used_step: string | null; }

async function lockTicket(client: pg.PoolClient, rawTicket: string, config: ApiConfig): Promise<TicketRow | null> {
  return (await client.query<TicketRow>(
    `select ticket.id::text, ticket.public_id::text, ticket.user_id::text,
            user_row.public_id::text as user_public_id, user_row.full_name, user_row.phone_e164,
            ticket.attempts_remaining, ticket.device_name, ticket.device_identifier_hash, ticket.created_ip::text
       from app.mfa_login_tickets ticket
       join app.users user_row on user_row.id = ticket.user_id
      where ticket.token_hash = $1 and ticket.consumed_at is null and ticket.expires_at > now()
        and ticket.attempts_remaining > 0 and user_row.status = 'active' and user_row.mfa_required
      for update of ticket`,
    [hashMfaValue(rawTicket, config.mfaTicketPepper)],
  )).rows[0] ?? null;
}

async function createMfaSession(client: pg.PoolClient, ticketRow: TicketRow, config: ApiConfig) {
  const accessToken = randomBytes(32).toString("base64url");
  const sessionPublicId = uuidV7();
  await client.query(
    `insert into app.device_sessions (
       public_id, user_id, token_hash, device_identifier_hash, device_name,
       expires_at, auth_method, mfa_verified_at, created_ip
     ) values ($1, $2, $3, $4, $5, now() + make_interval(secs => $6), 'otp_mfa', now(), $7)`,
    [sessionPublicId, ticketRow.user_id, hashSessionToken(accessToken, config.sessionTokenPepper), ticketRow.device_identifier_hash, ticketRow.device_name, config.privilegedSessionTtlSeconds, ticketRow.created_ip],
  );
  await client.query("update app.users set last_login_at = now(), updated_at = now() where id = $1", [ticketRow.user_id]);
  await client.query("update app.mfa_login_tickets set consumed_at = now() where id = $1", [ticketRow.id]);
  return { accessToken, sessionPublicId };
}

async function authenticatedBody(pool: pg.Pool, accessToken: string, config: ApiConfig) {
  const principal = await loadPrincipalBySessionHash(pool, hashSessionToken(accessToken, config.sessionTokenPepper));
  if (!principal) throw new Error("new MFA session could not be restored");
  const [memberships, agencies] = await Promise.all([
    pool.query<{ public_id: string; display_name: string; membership_type: string }>(
      `select tenant.public_id::text, tenant.display_name, membership.membership_type
         from app.tenant_memberships membership join app.tenants tenant on tenant.id = membership.tenant_id
        where membership.user_id = $1 and membership.status = 'active' and tenant.status = 'active'
        order by tenant.display_name, tenant.public_id`,
      [principal.userId],
    ),
    activeAgencyAccess(pool, principal.userId),
  ]);
  return {
    status: "authenticated" as const, accessToken, tokenType: "Bearer" as const, expiresInSeconds: config.privilegedSessionTtlSeconds,
    user: { publicId: principal.userPublicId, fullName: principal.fullName, phoneE164: principal.phoneE164 },
    tenants: memberships.rows.map((row) => ({ publicId: row.public_id, displayName: row.display_name, membershipType: row.membership_type })),
    agencies, platformAccess: platformAccessFromAssignments(principal.assignments),
  };
}

async function failedAttempt(client: pg.PoolClient, ticketRow: TicketRow) {
  const remaining = Math.max(0, ticketRow.attempts_remaining - 1);
  await client.query("update app.mfa_login_tickets set attempts_remaining = $2::smallint, consumed_at = case when $2::smallint = 0 then now() else consumed_at end where id = $1", [ticketRow.id, remaining]);
  return remaining;
}

export function authMfaRouter(options: { pool: pg.Pool; config: ApiConfig }): Router {
  const { pool, config } = options;
  const router = Router();

  router.post("/auth/mfa/enroll", async (request, response, next) => {
    try {
      const parsed = enrollSchema.safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, "invalid_request", "The MFA enrollment request is invalid.", parsed.error.flatten());
      const enrollment = await withTransaction(pool, async (client) => {
        const ticketRow = await lockTicket(client, parsed.data.mfaTicket, config);
        if (!ticketRow) throw new HttpError(401, "invalid_mfa_ticket", "The MFA handoff has expired or is invalid. Verify your phone again.");
        const active = await client.query("select 1 from app.mfa_factors where user_id = $1 and status = 'active'", [ticketRow.user_id]);
        if (active.rowCount) throw new HttpError(409, "mfa_already_enrolled", "An active authenticator is already enrolled. Continue with MFA verification.");
        let factor = (await client.query<FactorRow>("select id::text, public_id::text, secret_envelope, status, last_used_step::text from app.mfa_factors where user_id = $1 and status = 'pending' for update", [ticketRow.user_id])).rows[0];
        let secret: string;
        if (factor) secret = decryptSecret(factor.secret_envelope, config.mfaEncryptionKey, factor.public_id);
        else {
          const factorPublicId = uuidV7();
          secret = generateTotpSecret();
          factor = (await client.query<FactorRow>(
            `insert into app.mfa_factors (public_id, user_id, label, secret_envelope)
             values ($1, $2, $3, $4) returning id::text, public_id::text, secret_envelope, status, last_used_step::text`,
            [factorPublicId, ticketRow.user_id, parsed.data.label, encryptSecret(secret, config.mfaEncryptionKey, factorPublicId)],
          )).rows[0]!;
        }
        return { factorPublicId: factor.public_id, secret, account: ticketRow.phone_e164 };
      });
      response.status(200).json({ factorPublicId: enrollment.factorPublicId, factorType: "totp", manualKey: enrollment.secret, otpauthUri: totpUri(config.mfaIssuer, enrollment.account, enrollment.secret), issuer: config.mfaIssuer, algorithm: "SHA1", digits: 6, periodSeconds: 30 });
    } catch (error) { next(error); }
  });

  router.post("/auth/mfa/enroll/verify", async (request, response, next) => {
    try {
      const parsed = enrollmentVerifySchema.safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, "invalid_request", "The MFA enrollment verification is invalid.", parsed.error.flatten());
      const result = await withTransaction(pool, async (client) => {
        const ticketRow = await lockTicket(client, parsed.data.mfaTicket, config);
        if (!ticketRow) throw new HttpError(401, "invalid_mfa_ticket", "The MFA handoff has expired or is invalid. Verify your phone again.");
        const factor = (await client.query<FactorRow>(
          "select id::text, public_id::text, secret_envelope, status, last_used_step::text from app.mfa_factors where public_id = $1 and user_id = $2 and status = 'pending' for update",
          [parsed.data.factorPublicId, ticketRow.user_id],
        )).rows[0];
        if (!factor) throw new HttpError(409, "mfa_enrollment_unavailable", "The pending authenticator enrollment is unavailable.");
        const secret = decryptSecret(factor.secret_envelope, config.mfaEncryptionKey, factor.public_id);
        const step = verifyTotp(secret, parsed.data.code);
        if (step === null) return { invalid: true as const, remainingAttempts: await failedAttempt(client, ticketRow) };
        const recoveryCodes = generateRecoveryCodes();
        await client.query("update app.mfa_factors set status = 'active', verified_at = now(), last_used_step = $2, updated_at = now() where id = $1", [factor.id, step]);
        await client.query(
          `insert into app.mfa_recovery_codes (factor_id, code_hash)
           select $1, decode(value, 'hex') from unnest($2::text[]) value`,
          [factor.id, recoveryCodes.map((code) => hashMfaValue(normalizeRecoveryCode(code), config.mfaTicketPepper).toString("hex"))],
        );
        const session = await createMfaSession(client, ticketRow, config);
        await client.query(
          `insert into app.audit_events (public_id, actor_user_id, actor_role, action, entity_type, entity_public_id, after_values, request_id, correlation_id, source_ip, user_agent)
           values ($1, $2, 'privileged_user', 'mfa.enrolled', 'mfa_factor', $3, $4::jsonb, $5, $6, $7, $8)`,
          [uuidV7(), ticketRow.user_id, factor.public_id, JSON.stringify({ factorType: "totp", recoveryCodeCount: recoveryCodes.length, sessionPublicId: session.sessionPublicId }), uuidV7(), uuidV7(), request.ip || null, request.header("user-agent")?.slice(0, 500) ?? null],
        );
        return { invalid: false as const, accessToken: session.accessToken, recoveryCodes };
      });
      if (result.invalid) throw new HttpError(422, "invalid_mfa_code", "The authenticator code is invalid or expired.", { remainingAttempts: result.remainingAttempts });
      response.status(200).json({ ...(await authenticatedBody(pool, result.accessToken, config)), recoveryCodes: result.recoveryCodes });
    } catch (error) { next(error); }
  });

  router.post("/auth/mfa/verify", async (request, response, next) => {
    try {
      const parsed = verifySchema.safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, "invalid_request", "The MFA verification request is invalid.", parsed.error.flatten());
      const result = await withTransaction(pool, async (client) => {
        const ticketRow = await lockTicket(client, parsed.data.mfaTicket, config);
        if (!ticketRow) throw new HttpError(401, "invalid_mfa_ticket", "The MFA handoff has expired or is invalid. Verify your phone again.");
        const factor = (await client.query<FactorRow>(
          "select id::text, public_id::text, secret_envelope, status, last_used_step::text from app.mfa_factors where user_id = $1 and status = 'active' for update",
          [ticketRow.user_id],
        )).rows[0];
        if (!factor) throw new HttpError(409, "mfa_enrollment_required", "No active authenticator is enrolled for this account.");
        let method: "totp" | "recovery_code" | null = null;
        let step: number | null = null;
        if (/^[0-9]{6}$/.test(parsed.data.code)) {
          const secret = decryptSecret(factor.secret_envelope, config.mfaEncryptionKey, factor.public_id);
          step = verifyTotp(secret, parsed.data.code);
          if (step !== null && factor.last_used_step !== null && step <= Number(factor.last_used_step)) step = null;
          if (step !== null) method = "totp";
        } else {
          const normalized = normalizeRecoveryCode(parsed.data.code);
          if (normalized.length === 8) {
            const recovery = (await client.query<{ id: string }>(
              "select id::text from app.mfa_recovery_codes where factor_id = $1 and code_hash = $2 and consumed_at is null for update",
              [factor.id, hashMfaValue(normalized, config.mfaTicketPepper)],
            )).rows[0];
            if (recovery) { await client.query("update app.mfa_recovery_codes set consumed_at = now() where id = $1", [recovery.id]); method = "recovery_code"; }
          }
        }
        if (!method) return { invalid: true as const, remainingAttempts: await failedAttempt(client, ticketRow) };
        if (step !== null) await client.query("update app.mfa_factors set last_used_step = $2, updated_at = now() where id = $1", [factor.id, step]);
        const session = await createMfaSession(client, ticketRow, config);
        await client.query(
          `insert into app.audit_events (public_id, actor_user_id, actor_role, action, entity_type, entity_public_id, after_values, request_id, correlation_id, source_ip, user_agent)
           values ($1, $2, 'privileged_user', 'mfa.verified', 'device_session', $3, $4::jsonb, $5, $6, $7, $8)`,
          [uuidV7(), ticketRow.user_id, session.sessionPublicId, JSON.stringify({ method, factorPublicId: factor.public_id }), uuidV7(), uuidV7(), request.ip || null, request.header("user-agent")?.slice(0, 500) ?? null],
        );
        return { invalid: false as const, accessToken: session.accessToken, recoveryCodeUsed: method === "recovery_code" };
      });
      if (result.invalid) throw new HttpError(422, "invalid_mfa_code", "The authenticator or recovery code is invalid.", { remainingAttempts: result.remainingAttempts });
      response.status(200).json({ ...(await authenticatedBody(pool, result.accessToken, config)), recoveryCodeUsed: result.recoveryCodeUsed });
    } catch (error) { next(error); }
  });

  return router;
}
