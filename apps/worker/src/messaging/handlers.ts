import type pg from "pg";
import type { OutboxEvent } from "@platform/database";
import { withTransaction } from "@platform/database";
import { decryptSecret, type Logger, uuidV7 } from "@platform/runtime";
import { z } from "zod";
import type { MessagingProvider, OutboundMessage } from "./provider";

export type EventHandler = (event: OutboxEvent) => Promise<void>;

const tenantInvitation = z.object({
  invitationPublicId: z.string().uuid(),
  tenantPublicId: z.string().uuid(),
  tenantDisplayName: z.string().min(1),
  servingAgencyName: z.string().min(1),
  appLink: z.string().url(),
  supportContact: z.string().min(1),
  userPublicId: z.string().uuid(),
  destinationE164: z.string().regex(/^\+[1-9][0-9]{7,14}$/),
  strategy: z.literal("sms_first"),
  whatsappFallbackAfterSeconds: z.number().int().positive(),
}).passthrough();

const platformInvitation = z.object({
  invitationPublicId: z.string().uuid(),
  userPublicId: z.string().uuid(),
  destinationE164: z.string().regex(/^\+[1-9][0-9]{7,14}$/),
  rolePublicId: z.string().uuid(),
  roleAssignmentPublicId: z.string().uuid(),
  strategy: z.literal("sms_first"),
  whatsappFallbackAfterSeconds: z.number().int().positive(),
});

const otpRequest = z.object({
  challengePublicId: z.string().uuid(),
  destinationE164: z.string().regex(/^\+[1-9][0-9]{7,14}$/),
  encryptedCode: z.string().min(1),
  purpose: z.literal("login"),
  strategy: z.literal("sms_first"),
});

type MessageKind = "tenant_invitation" | "platform_user_invitation" | "login_otp";

interface DeliveryRow {
  id: string;
  status: "queued" | "sent" | "delivered" | "failed";
}

interface TenantInvitationState {
  status: string;
  completed_at: Date | null;
  tenant_status: string;
  user_status: string;
  phone_e164: string;
}

interface PlatformInvitationState {
  status: string;
  completed_at: Date | null;
  assignment_status: string;
  assignment_expires_at: Date | null;
  user_status: string;
  phone_e164: string;
}

interface OtpState {
  delivery_status: string;
  expires_at: Date;
  consumed_at: Date | null;
  invalidated_at: Date | null;
  user_id: string | null;
  user_status: string | null;
  phone_e164: string;
}

interface DeliveryGate {
  deliverable: boolean;
  reason?: string;
}

async function tenantInvitationGate(pool: pg.Pool, invitationPublicId: string, destinationE164: string): Promise<DeliveryGate> {
  const row = (
    await pool.query<TenantInvitationState>(
      `select invitation.status, invitation.completed_at,
              tenant.status as tenant_status,
              user_row.status as user_status,
              user_row.phone_e164
         from app.invitations invitation
         join app.tenants tenant on tenant.id = invitation.tenant_id
         join app.users user_row on user_row.id = invitation.user_id
        where invitation.public_id = $1`,
      [invitationPublicId],
    )
  ).rows[0];
  if (!row) return { deliverable: false, reason: "invitation_missing" };
  if (row.completed_at) return { deliverable: false, reason: "invitation_completed" };
  if (!new Set(["queued", "sms_sent"]).has(row.status)) return { deliverable: false, reason: "invitation_not_active" };
  if (row.tenant_status !== "active") return { deliverable: false, reason: "tenant_not_active" };
  if (!new Set(["invited", "active"]).has(row.user_status)) return { deliverable: false, reason: "user_not_active" };
  if (row.phone_e164 !== destinationE164) return { deliverable: false, reason: "invitation_destination_changed" };
  return { deliverable: true };
}

async function platformInvitationGate(pool: pg.Pool, invitationPublicId: string, destinationE164: string): Promise<DeliveryGate> {
  const row = (
    await pool.query<PlatformInvitationState>(
      `select invitation.status, invitation.completed_at,
              assignment.status as assignment_status,
              assignment.expires_at as assignment_expires_at,
              user_row.status as user_status,
              user_row.phone_e164
         from app.platform_user_invitations invitation
         join app.role_assignments assignment on assignment.id = invitation.role_assignment_id
         join app.users user_row on user_row.id = invitation.user_id
        where invitation.public_id = $1`,
      [invitationPublicId],
    )
  ).rows[0];
  if (!row) return { deliverable: false, reason: "invitation_missing" };
  if (row.completed_at) return { deliverable: false, reason: "invitation_completed" };
  if (!new Set(["queued", "sms_sent"]).has(row.status)) return { deliverable: false, reason: "invitation_not_active" };
  if (row.assignment_status !== "active") return { deliverable: false, reason: "role_assignment_not_active" };
  if (row.assignment_expires_at && row.assignment_expires_at.getTime() <= Date.now()) {
    return { deliverable: false, reason: "role_assignment_expired" };
  }
  if (!new Set(["invited", "active"]).has(row.user_status)) return { deliverable: false, reason: "user_not_active" };
  if (row.phone_e164 !== destinationE164) return { deliverable: false, reason: "invitation_destination_changed" };
  return { deliverable: true };
}

async function otpGate(pool: pg.Pool, challengePublicId: string, destinationE164: string): Promise<DeliveryGate> {
  const row = (
    await pool.query<OtpState>(
      `select challenge.delivery_status, challenge.expires_at,
              challenge.consumed_at, challenge.invalidated_at,
              challenge.user_id::text,
              user_row.status as user_status,
              challenge.phone_e164
         from app.otp_challenges challenge
         left join app.users user_row on user_row.id = challenge.user_id
        where challenge.public_id = $1`,
      [challengePublicId],
    )
  ).rows[0];
  if (!row) return { deliverable: false, reason: "otp_challenge_missing" };
  if (row.expires_at.getTime() <= Date.now()) return { deliverable: false, reason: "otp_challenge_expired" };
  if (row.consumed_at) return { deliverable: false, reason: "otp_challenge_consumed" };
  if (row.invalidated_at) return { deliverable: false, reason: "otp_challenge_invalidated" };
  if (!row.user_id || !row.user_status || !new Set(["invited", "active"]).has(row.user_status)) {
    return { deliverable: false, reason: "otp_user_not_active" };
  }
  if (row.phone_e164 !== destinationE164) return { deliverable: false, reason: "otp_destination_changed" };
  if (row.delivery_status === "failed") return { deliverable: false, reason: "otp_delivery_closed" };
  return { deliverable: true };
}

async function updateAggregate(
  pool: pg.Pool,
  kind: MessageKind,
  aggregatePublicId: string,
  status: "sent" | "delivered",
  fallbackAfterSeconds?: number,
): Promise<void> {
  const invitationStatus = status === "delivered" ? "sms_delivered" : "sms_sent";
  if (kind === "tenant_invitation") {
    await pool.query(
      `update app.invitations
          set status = $2,
              sms_fallback_at = case when $2 = 'sms_sent' then coalesce(sms_fallback_at, now() + make_interval(secs => $3)) else null end,
              updated_at = now()
        where public_id = $1 and status in ('queued', 'sms_sent')`,
      [aggregatePublicId, invitationStatus, fallbackAfterSeconds],
    );
  } else if (kind === "platform_user_invitation") {
    await pool.query(
      `update app.platform_user_invitations
          set status = $2,
              sms_fallback_at = case when $2 = 'sms_sent' then coalesce(sms_fallback_at, now() + make_interval(secs => $3)) else null end,
              updated_at = now()
        where public_id = $1 and status in ('queued', 'sms_sent')`,
      [aggregatePublicId, invitationStatus, fallbackAfterSeconds],
    );
  } else {
    await pool.query(
      "update app.otp_challenges set delivery_status = $2 where public_id = $1 and delivery_status in ('queued', 'sent')",
      [aggregatePublicId, status],
    );
  }
}

export function createMessagingHandlers(options: {
  pool: pg.Pool;
  provider: MessagingProvider;
  otpDeliveryKey: string;
  logger: Logger;
}): Map<string, EventHandler> {
  const { pool, provider, otpDeliveryKey, logger } = options;

  const recordSkippedDelivery = async (
    event: OutboxEvent,
    kind: MessageKind,
    message: OutboundMessage,
    aggregatePublicId: string,
    reason: string,
  ) => {
    await pool.query(
      `insert into app.message_deliveries (
         public_id, message_kind, aggregate_public_id, channel, provider,
         template_name, template_version, destination_e164, idempotency_key,
         status, last_error, failed_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'failed', $10, now())
       on conflict (idempotency_key) do update
         set status = case
                        when app.message_deliveries.status in ('sent', 'delivered') then app.message_deliveries.status
                        else 'failed'
                      end,
             last_error = case
                            when app.message_deliveries.status in ('sent', 'delivered') then app.message_deliveries.last_error
                            else excluded.last_error
                          end,
             failed_at = case
                           when app.message_deliveries.status in ('sent', 'delivered') then app.message_deliveries.failed_at
                           else coalesce(app.message_deliveries.failed_at, now())
                         end,
             updated_at = now()`,
      [uuidV7(), kind, aggregatePublicId, message.channel, provider.name, message.template.name, message.template.version, message.destinationE164, message.idempotencyKey, `delivery_skipped:${reason}`],
    );
    if (kind === "login_otp") {
      await pool.query(
        "update app.otp_challenges set delivery_status = 'failed' where public_id = $1 and delivery_status = 'queued'",
        [aggregatePublicId],
      );
    }
    logger.warn("message_delivery_skipped", { event_id: event.publicId, message_kind: kind, provider: provider.name, reason });
  };

  const deliver = async (
    event: OutboxEvent,
    kind: MessageKind,
    message: OutboundMessage,
    aggregatePublicId: string,
    fallbackAfterSeconds?: number,
  ) => {
    const delivery = (
      await pool.query<DeliveryRow>(
        `insert into app.message_deliveries (
           public_id, message_kind, aggregate_public_id, channel, provider,
           template_name, template_version, destination_e164, idempotency_key, status
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'queued')
         on conflict (idempotency_key) do update set updated_at = app.message_deliveries.updated_at
         returning id::text, status`,
        [uuidV7(), kind, aggregatePublicId, message.channel, provider.name, message.template.name, message.template.version, message.destinationE164, message.idempotencyKey],
      )
    ).rows[0]!;
    if (delivery.status === "sent" || delivery.status === "delivered") {
      await updateAggregate(pool, kind, aggregatePublicId, delivery.status, fallbackAfterSeconds);
      return;
    }

    try {
      const receipt = await provider.send(message);
      await withTransaction(pool, async (client) => {
        await client.query(
          `update app.message_deliveries
              set status = $2, provider_reference = $3, attempt_count = attempt_count + 1,
                  last_error = null, failed_at = null,
                  sent_at = coalesce(sent_at, now()),
                  delivered_at = case when $2 = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
                  updated_at = now()
            where id = $1`,
          [delivery.id, receipt.status, receipt.providerReference],
        );
      });
      await updateAggregate(pool, kind, aggregatePublicId, receipt.status, fallbackAfterSeconds);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "unknown provider failure";
      await pool.query(
        `update app.message_deliveries
            set status = 'failed', attempt_count = attempt_count + 1,
                last_error = left($2, 2000), failed_at = now(), updated_at = now()
          where id = $1`,
        [delivery.id, messageText],
      );
      logger.warn("message_delivery_failed", { event_id: event.publicId, message_kind: kind, provider: provider.name, error });
      throw error;
    }
  };

  return new Map<string, EventHandler>([
    ["tenant.invitation.sms.requested", async (event) => {
      const payload = tenantInvitation.parse(event.payload);
      const message: OutboundMessage = {
        idempotencyKey: `tenant-invitation-sms:${payload.invitationPublicId}`,
        channel: "sms",
        destinationE164: payload.destinationE164,
        template: {
          name: "tenant_registration",
          version: "v1",
          parameters: {
            businessName: payload.tenantDisplayName,
            servingAgencyName: payload.servingAgencyName,
            appLink: payload.appLink,
            supportContact: payload.supportContact,
          },
        },
      };
      const gate = await tenantInvitationGate(pool, payload.invitationPublicId, payload.destinationE164);
      if (!gate.deliverable) {
        await recordSkippedDelivery(event, "tenant_invitation", message, payload.invitationPublicId, gate.reason ?? "invitation_not_deliverable");
        return;
      }
      await deliver(event, "tenant_invitation", message, payload.invitationPublicId, payload.whatsappFallbackAfterSeconds);
    }],
    ["platform_user.invitation.sms.requested", async (event) => {
      const payload = platformInvitation.parse(event.payload);
      const message: OutboundMessage = {
        idempotencyKey: `platform-user-invitation-sms:${payload.invitationPublicId}`,
        channel: "sms",
        destinationE164: payload.destinationE164,
        template: { name: "platform_access", version: "v1", parameters: {} },
      };
      const gate = await platformInvitationGate(pool, payload.invitationPublicId, payload.destinationE164);
      if (!gate.deliverable) {
        await recordSkippedDelivery(event, "platform_user_invitation", message, payload.invitationPublicId, gate.reason ?? "invitation_not_deliverable");
        return;
      }
      await deliver(event, "platform_user_invitation", message, payload.invitationPublicId, payload.whatsappFallbackAfterSeconds);
    }],
    ["auth.otp.sms.requested", async (event) => {
      const payload = otpRequest.parse(event.payload);
      const messageWithoutCode: OutboundMessage = {
        idempotencyKey: `auth-otp-sms:${payload.challengePublicId}`,
        channel: "sms",
        destinationE164: payload.destinationE164,
        template: { name: "login_otp", version: "v1", parameters: {} },
      };
      const gate = await otpGate(pool, payload.challengePublicId, payload.destinationE164);
      if (!gate.deliverable) {
        await recordSkippedDelivery(event, "login_otp", messageWithoutCode, payload.challengePublicId, gate.reason ?? "otp_not_deliverable");
        return;
      }
      const code = decryptSecret(payload.encryptedCode, otpDeliveryKey, payload.challengePublicId);
      await deliver(event, "login_otp", {
        ...messageWithoutCode,
        template: { ...messageWithoutCode.template, parameters: { code } },
      }, payload.challengePublicId);
    }],
  ]);
}
