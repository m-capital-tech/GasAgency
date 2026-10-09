export type MessageChannel = "sms" | "whatsapp";
export type DeliveryStatus = "sent" | "delivered";

export interface OutboundMessage {
  idempotencyKey: string;
  channel: MessageChannel;
  destinationE164: string;
  template: {
    name: string;
    version: string;
    parameters: Record<string, string>;
  };
}

export interface DeliveryReceipt {
  provider: string;
  providerReference: string;
  status: DeliveryStatus;
}

export interface MessagingProvider {
  readonly name: string;
  send(message: OutboundMessage): Promise<DeliveryReceipt>;
}
