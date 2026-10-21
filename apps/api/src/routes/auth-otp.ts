import { createHash, randomBytes, randomInt } from "node:crypto";
import type pg from "pg";
import { Router } from "express";
import { withTransaction } from "@platform/database";
import { encryptSecret, uuidV7 } from "@platform/runtime";
import { z } from "zod";
import type { ApiConfig } from "../config";
import { activeAgencyAccess } from "../domain/agency-access";
import { HttpError } from "../http/error";
import { hashMfaValue } from "../security/mfa";
import { hashOtpCode, hashRateKey, maskPhone, otpMatches } from "../security/otp";
import { hashSessionToken } from "../security/token";

const requestSchema = z.object({ phoneE164: z.string().regex(/^\+[1-9][0-9]{7,14}$/) }).strict();
const verifySchema = z.object({
  challengePublicId: z.string().uuid(),
  code: z.string().regex(/^[0-9]{6}$/),
  deviceName: z.string().trim().min(1).max(120).optional(),
  deviceIdentifier: z.string().min(8).max(500).optional(),
}).strict();

interface EligibleUserRow {
  id: string;
  public_id: string;
  status: string;
  full_name: string;
  phone_e164: string;
  last_login_at: Date | null;
  mfa_required: boolean;
  has_tenant_access: boolean;
  has_platform_access: boolean;
}

function generateCode(config: ApiConfig): string {
  return config.otpLocalCode ?? randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function requestResult(config: ApiConfig, phoneE164: string, challengePublicId: string, resendAfterSeconds: number, localDebugCode?: string) {
  return {
    accepted: true,
    challengePublicId,
    destination: maskPhone(phoneE164),
    expiresInSeconds: config.otpTtlSeconds,
    resendAfterSeconds,
    ...(localDebugCode ? { localDebugCode } : {}),
  };
}

async function eligibleUser(client: pg.PoolClient, phoneE164: string, lock = false): Promise<EligibleUserRow | undefined> {
  const result = await client.query<EligibleUserRow>(
    `select user_row.id::text,
            user_row.public_id::text,
            user_row.status,
            user_row.full_name,
            user_row.phone_e164,
            user_row.last_login_at,
            user_row.mfa_required,
            exists (
              select 1 from app.tenant_memberships membership
              join app.tenants tenant on tenant.id = membership.tenant_id
              where membership.user_id = user_row.id
                and membership.status in ('invited', 'active')
                and tenant.status = 'active'
            ) as has_tenant_access,
            exists (
              select 1 from app.role_assignments assignment
              join app.roles role_row on role_row.id = assignment.role_id
              where assignment.user_id = user_row.id
                and assignment.status = 'active'
                and (assignment.expires_at is null or assignment.expires_at > now())
                and role_row.status = 'active'
            ) as has_platform_access
       from app.users user_row
      where user_row.phone_e164 = $1
        and user_row.status in ('invited', 'active')
      ${lock ? "for update" : ""}`,
    [phoneE164],
  );
  const row = result.rows[0];
  return row && (row.status === "active" || row.has_tenant_access || row.has_platform_access) ? row : undefined;
}

export function authOtpRouter(options: { pool: pg.Pool; config: ApiConfig }): Router {
  const { pool, config } = options;
  const router = Router();

  router.post("/auth/otp/request", async (request, response, next) => {
    try {
      const parsed = requestSchema.safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, "invalid_request", "A valid E.164 phone number is required.");
      const phoneE164 = parsed.data.phoneE164;
      const phoneHash = hashRateKey("phone", phoneE164, config.otpHashPepper);
      const ip = request.ip || "unknown";
      const ipHash = hashRateKey("ip", ip, config.otpHashPepper);

      const result = await withTransaction(pool, async (client) => {
        await client.query(
          `delete from app.auth_rate_events
            where id in (
              select id from app.auth_rate_events where expires_at <= now() order by id limit 100
            )`,
        );
        const counts = await client.query<{ phone_count: number; ip_count: number }>(
          `select
             count(*) filter (where event_type = 'otp_request_phone' and key_hash = $1)::int as phone_count,
             count(*) filter (where event_type = 'otp_request_ip' and key_hash = $2)::int as ip_count
           from app.auth_rate_events
           where created_at > now() - interval '15 minutes'`,
          [phoneHash, ipHash],
        );
        await client.query(
          `insert into app.auth_rate_events (public_id, event_type, key_hash, expires_at)
           values ($1, 'otp_request_phone', $2, now() + interval '1 hour'),
                  ($3, 'otp_request_ip', $4, now() + interval '1 hour')`,
          [uuidV7(), phoneHash, uuidV7(), ipHash],
        );
        const existing = (
          await client.query<{ public_id: string; resend_seconds: number }>(
            `select public_id::text,
                    greatest(0, ceil(extract(epoch from resend_available_at - now())))::int as resend_seconds
               from app.otp_challenges
              where phone_e164 = $1 and purpose = 'login'
                and consumed_at is null and invalidated_at is null and expires_at > now()
              order by created_at desc limit 1`,
            [phoneE164],
          )
        ).rows[0];
        if (existing && existing.resend_seconds > 0) {
          return { response: requestResult(config, phoneE164, existing.public_id, existing.resend_seconds) };
        }

        const limited = (counts.rows[0]?.phone_count ?? 0) >= 5 || (counts.rows[0]?.ip_count ?? 0) >= 20;
        const user = limited ? undefined : await eligibleUser(client, phoneE164);
        await client.query(
          `update app.otp_challenges set invalidated_at = now()
            where phone_e164 = $1 and purpose = 'login'
              and consumed_at is null and invalidated_at is null`,
          [phoneE164],
        );
        const challengePublicId = uuidV7();
        const code = generateCode(config);
        await client.query(
          `insert into app.otp_challenges (
             public_id, user_id, phone_e164, purpose, code_hash, request_ip_hash,
             max_attempts, expires_at, resend_available_at, delivery_status
           ) values (
             $1, $2, $3, 'login', $4, $5, $6,
             now() + make_interval(secs => $7), now() + make_interval(secs => $8), 'queued'
           )`,
          [challengePublicId, user?.id ?? null, phoneE164, hashOtpCode(challengePublicId, user ? code : randomBytes(16).toString("hex"), config.otpHashPepper), ipHash, config.otpMaxAttempts, config.otpTtlSeconds, config.otpResendSeconds],
        );
        if (user) {
          await client.query(
            `insert into app.outbox_events (
               public_id, event_type, aggregate_type, aggregate_public_id, payload, dedupe_key
             ) values ($1, 'auth.otp.sms.requested', 'otp_challenge', $2, $3::jsonb, $4)`,
            [uuidV7(), challengePublicId, JSON.stringify({ challengePublicId, destinationE164: phoneE164, encryptedCode: encryptSecret(code, config.otpDeliveryKey, challengePublicId), purpose: "login", strategy: "sms_first" }), `auth-otp-sms:${challengePublicId}`],
          );
        }
        return { response: requestResult(config, phoneE164, challengePublicId, config.otpResendSeconds, user && config.otpLocalExposeCode ? code : undefined) };
      });
      response.status(202).json(result.response);
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/otp/verify", async (request, response, next) => {
    try {
      const parsed = verifySchema.safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, "invalid_request", "The OTP verification request is invalid.", parsed.error.flatten());
      const ip = request.ip || null;
      const outcome = await withTransaction(pool, async (client) => {
        const challenge = (
          await client.query<{
            id: string; public_id: string; user_id: string | null; phone_e164: string; code_hash: Buffer;
            attempt_count: number; max_attempts: number; expires_at: Date; consumed_at: Date | null; invalidated_at: Date | null;
          }>(
            `select id::text, public_id::text, user_id::text, phone_e164, code_hash,
                    attempt_count, max_attempts, expires_at, consumed_at, invalidated_at
               from app.otp_challenges where public_id = $1 for update`,
            [parsed.data.challengePublicId],
          )
        ).rows[0];
        const candidateHash = hashOtpCode(parsed.data.challengePublicId, parsed.data.code, config.otpHashPepper);
        if (!challenge) {
          otpMatches(Buffer.alloc(candidateHash.length), candidateHash);
          return { kind: "invalid" as const };
        }
        if (challenge.consumed_at || challenge.invalidated_at || challenge.expires_at.getTime() <= Date.now() || !challenge.user_id) {
          return { kind: "invalid" as const };
        }
        if (!otpMatches(challenge.code_hash, candidateHash)) {
          const nextAttempts = challenge.attempt_count + 1;
          await client.query(
            `update app.otp_challenges
                set attempt_count = $2,
                    invalidated_at = case when $2 >= max_attempts then now() else invalidated_at end
              where id = $1`,
            [challenge.id, nextAttempts],
          );
          await client.query(
            `insert into app.auth_rate_events (public_id, event_type, key_hash, expires_at)
             values ($1, 'otp_verify_failure', $2, now() + interval '1 hour')`,
            [uuidV7(), hashRateKey("phone", challenge.phone_e164, config.otpHashPepper)],
          );
          return { kind: "invalid" as const, remainingAttempts: Math.max(0, challenge.max_attempts - nextAttempts) };
        }

        const user = await eligibleUser(client, challenge.phone_e164, true);
        if (!user || user.id !== challenge.user_id) {
          await client.query("update app.otp_challenges set invalidated_at = now() where id = $1", [challenge.id]);
          return { kind: "invalid" as const };
        }
        await client.query("update app.otp_challenges set consumed_at = now() where id = $1", [challenge.id]);
        await client.query(
          "update app.users set status = 'active', last_login_at = case when $2::boolean then last_login_at else now() end, updated_at = now() where id = $1",
          [user.id, user.mfa_required],
        );
        await client.query(
          `update app.tenant_memberships membership
              set status = 'active', activated_at = coalesce(activated_at, now()), updated_at = now()
             from app.tenants tenant
            where membership.user_id = $1 and tenant.id = membership.tenant_id
              and membership.status = 'invited' and tenant.status = 'active'`,
          [user.id],
        );
        await client.query("update app.invitations set completed_at = now(), updated_at = now() where user_id = $1 and completed_at is null", [user.id]);
        await client.query("update app.platform_user_invitations set completed_at = now(), updated_at = now() where user_id = $1 and completed_at is null", [user.id]);

        const deviceHash = parsed.data.deviceIdentifier
          ? createHash("sha256").update(parsed.data.deviceIdentifier, "utf8").digest()
          : null;

        if (user.mfa_required) {
          const hasActiveFactor = (await client.query(
            "select 1 from app.mfa_factors where user_id = $1 and status = 'active'",
            [user.id],
          )).rowCount === 1;
          const mfaTicket = randomBytes(32).toString("base64url");
          const mfaTicketPublicId = uuidV7();
          await client.query(
            "update app.mfa_login_tickets set consumed_at = coalesce(consumed_at, now()) where user_id = $1 and consumed_at is null",
            [user.id],
          );
          await client.query(
            `insert into app.mfa_login_tickets (
               public_id, user_id, token_hash, phone_verified_at, expires_at,
               attempts_remaining, device_name, device_identifier_hash, created_ip
             ) values ($1, $2, $3, now(), now() + make_interval(secs => $4), $5, $6, $7, $8)`,
            [
              mfaTicketPublicId,
              user.id,
              hashMfaValue(mfaTicket, config.mfaTicketPepper),
              config.mfaTicketTtlSeconds,
              config.mfaMaxAttempts,
              parsed.data.deviceName ?? null,
              deviceHash,
              ip,
            ],
          );
          const status = hasActiveFactor ? "mfa_verification_required" as const : "mfa_enrollment_required" as const;
          await client.query(
            `insert into app.audit_events (
               public_id, actor_user_id, action, entity_type, entity_public_id,
               after_values, request_id, correlation_id, source_ip, user_agent
             ) values ($1, $2, 'auth.phone_verified', 'user', $3, $4::jsonb, $5, $6, $7, $8)`,
            [uuidV7(), user.id, user.public_id, JSON.stringify({ mfaEnrollmentRequired: !hasActiveFactor, mfaVerificationRequired: hasActiveFactor, mfaTicketPublicId }), uuidV7(), uuidV7(), ip, request.header("user-agent")?.slice(0, 500) ?? null],
          );
          return {
            kind: "mfa_required" as const,
            status,
            mfaTicket,
            expiresInSeconds: config.mfaTicketTtlSeconds,
            user: { publicId: user.public_id, fullName: user.full_name, phoneE164: user.phone_e164 },
          };
        }

        const sessionToken = randomBytes(32).toString("base64url");
        const sessionPublicId = uuidV7();
        await client.query(
          `insert into app.device_sessions (
             public_id, user_id, token_hash, device_identifier_hash, device_name,
             expires_at, auth_method, created_ip
           ) values ($1, $2, $3, $4, $5, now() + make_interval(secs => $6), 'otp', $7)`,
          [sessionPublicId, user.id, hashSessionToken(sessionToken, config.sessionTokenPepper), deviceHash, parsed.data.deviceName ?? null, config.sessionTtlSeconds, ip],
        );
        const memberships = await client.query<{ tenant_public_id: string; display_name: string; membership_type: string }>(
          `select tenant.public_id::text as tenant_public_id, tenant.display_name, membership.membership_type
             from app.tenant_memberships membership
             join app.tenants tenant on tenant.id = membership.tenant_id
            where membership.user_id = $1 and membership.status = 'active' and tenant.status = 'active'
            order by tenant.display_name, tenant.public_id`,
          [user.id],
        );
        const agencies = await activeAgencyAccess(client, user.id);
        await client.query(
          `insert into app.audit_events (
             public_id, actor_user_id, action, entity_type, entity_public_id,
             after_values, request_id, correlation_id, source_ip, user_agent
           ) values ($1, $2, 'auth.otp_verified', 'device_session', $3, $4::jsonb, $5, $6, $7, $8)`,
          [uuidV7(), user.id, sessionPublicId, JSON.stringify({ authMethod: "otp", tenantCount: memberships.rowCount }), uuidV7(), uuidV7(), ip, request.header("user-agent")?.slice(0, 500) ?? null],
        );
        return {
          kind: "authenticated" as const,
          accessToken: sessionToken,
          expiresInSeconds: config.sessionTtlSeconds,
          user: { publicId: user.public_id, fullName: user.full_name, phoneE164: user.phone_e164 },
          firstLogin: user.last_login_at === null,
          tenants: memberships.rows.map((membership) => ({ publicId: membership.tenant_public_id, displayName: membership.display_name, membershipType: membership.membership_type })),
          agencies,
        };
      });

      if (outcome.kind === "invalid") {
        throw new HttpError(422, "invalid_otp", "The OTP is invalid, expired, or already used.", "remainingAttempts" in outcome ? { remainingAttempts: outcome.remainingAttempts } : undefined);
      }
      if (outcome.kind === "mfa_required") {
        response.status(200).json({ status: outcome.status, mfaTicket: outcome.mfaTicket, expiresInSeconds: outcome.expiresInSeconds, user: outcome.user });
        return;
      }
      response.status(200).json({ status: "authenticated", accessToken: outcome.accessToken, tokenType: "Bearer", expiresInSeconds: outcome.expiresInSeconds, firstLogin: outcome.firstLogin, user: outcome.user, tenants: outcome.tenants, agencies: outcome.agencies });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
