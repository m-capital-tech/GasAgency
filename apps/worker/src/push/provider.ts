export interface OutboundPush {
  deliveryPublicId: string;
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

export type PushSendResult =
  | { deliveryPublicId: string; outcome: "accepted"; providerReference: string }
  | { deliveryPublicId: string; outcome: "device_not_registered"; errorCode: "DeviceNotRegistered" }
  | { deliveryPublicId: string; outcome: "failed"; errorCode: string; retryable: boolean };

export interface PushProvider {
  readonly name: string;
  send(messages: readonly OutboundPush[]): Promise<PushSendResult[]>;
}

export class PushProviderError extends Error {
  constructor(
    message: string,
    readonly errorCode: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PushProviderError";
  }
}
