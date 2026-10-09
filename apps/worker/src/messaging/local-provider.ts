import { createHash } from "node:crypto";
import type { Logger } from "@platform/runtime";
import type { DeliveryReceipt, MessagingProvider, OutboundMessage } from "./provider";

export class LocalMessagingProvider implements MessagingProvider {
  readonly name = "local";

  constructor(
    private readonly logger: Logger,
    private readonly revealContent: boolean,
  ) {}

  async send(message: OutboundMessage): Promise<DeliveryReceipt> {
    const providerReference = `local-${createHash("sha256").update(message.idempotencyKey).digest("hex").slice(0, 24)}`;
    this.logger.info("local_message_delivered", {
      provider_reference: providerReference,
      channel: message.channel,
      destination: `${message.destinationE164.slice(0, 3)}••••••${message.destinationE164.slice(-3)}`,
      template: message.template.name,
      ...(this.revealContent ? { local_template_parameters: message.template.parameters } : {}),
    });
    return { provider: this.name, providerReference, status: "delivered" };
  }
}
