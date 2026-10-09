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

async function updateAggregate(pool: pg.Pool, kind: MessageKind, aggregatePublicId: string, status: "sent" | "delivered"): Promise<void> {
  const invitationStatus = status === "delivered" ? "sms_delivered" : "sms_sent";
  if (kind === "tenant_invitation") {
    await pool.query(
      `update app.invitations
          set status = $2,
              sms_fallback_at = case when $2 = 'sms_sent' then now() + interval '5 minutes' else null end,
              updated_at = now()
        where public_id = $1 and status in ('queued', 'sms_sent')`,
      [aggregatePublicId, invitationStatus],
    );
  } else if (kind === "platform_user_invitation") {
    await pool.query(
      `update app.platform_user_invitations
          set status = $2,
              sms_fallback_at = case when $2 = 'sms_sent' then now() + interval '5 minutes' else null end,
              updated_at = now()
        where public_id = $1 and status in ('queued', 'sms_sent')`,
      [aggregatePublicId, invitationStatus],
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

  const deliver = async (event: OutboxEvent, kind: MessageKind, message: OutboundMessage, aggregatePublicId: string) => {
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
      await updateAggregate(pool, kind, aggregatePublicId, delivery.status);
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
      await updateAggregate(pool, kind, aggregatePublicId, receipt.status);
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
      await deliver(event, "tenant_invitation", {
        idempotencyKey: `tenant-invitation-sms:${payload.invitationPublicId}`,
        channel: "sms",
        destinationE164: payload.destinationE164,
        template: { name: "tenant_registration", version: "v1", parameters: { businessName: payload.tenantDisplayName } },
      }, payload.invitationPublicId);
    }],
    ["platform_user.invitation.sms.requested", async (event) => {
      const payload = platformInvitation.parse(event.payload);
      await deliver(event, "platform_user_invitation", {
        idempotencyKey: `platform-user-invitation-sms:${payload.invitationPublicId}`,
        channel: "sms",
        destinationE164: payload.destinationE164,
        template: { name: "platform_access", version: "v1", parameters: {} },
      }, payload.invitationPublicId);
    }],
    ["auth.otp.sms.requested", async (event) => {
      const payload = otpRequest.parse(event.payload);
      const code = decryptSecret(payload.encryptedCode, otpDeliveryKey, payload.challengePublicId);
      await deliver(event, "login_otp", {
        idempotencyKey: `auth-otp-sms:${payload.challengePublicId}`,
        channel: "sms",
        destinationE164: payload.destinationE164,
        template: { name: "login_otp", version: "v1", parameters: { code } },
      }, payload.challengePublicId);
    }],
  ]);
}
