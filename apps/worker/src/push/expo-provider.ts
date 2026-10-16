import type { OutboundPush, PushProvider, PushSendResult } from "./provider";
import { PushProviderError } from "./provider";

const endpoint = "https://exp.host/--/api/v2/push/send";
const expoTokenPattern = /^Expo(?:nent)?PushToken\[[^\]\s]{10,400}\]$/;
const safeErrorCodePattern = /^[A-Za-z][A-Za-z0-9_.-]{1,79}$/;
const providerReferencePattern = /^[A-Za-z0-9._-]{1,200}$/;

interface ExpoTicket {
  status?: unknown;
  id?: unknown;
  details?: { error?: unknown };
}

export interface ExpoPushProviderOptions {
  requestTimeoutMs: number;
  accessToken?: string;
  fetchImplementation?: typeof fetch;
}

function safeErrorCode(value: unknown, fallback: string): string {
  return typeof value === "string" && safeErrorCodePattern.test(value) ? value : fallback;
}

function retryableExpoError(code: string): boolean {
  return ["MessageRateExceeded", "ServiceUnavailable", "InternalServerError", "InvalidCredentials", "MismatchSenderId", "InvalidProviderToken"].includes(code);
}

export class ExpoPushProvider implements PushProvider {
  readonly name = "expo";
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: ExpoPushProviderOptions) {
    if (!Number.isInteger(options.requestTimeoutMs) || options.requestTimeoutMs < 1_000 || options.requestTimeoutMs > 30_000) {
      throw new Error("Expo push timeout must be between 1000 and 30000 milliseconds");
    }
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async send(messages: readonly OutboundPush[]): Promise<PushSendResult[]> {
    if (messages.length < 1 || messages.length > 100) throw new PushProviderError("Expo push batch size is invalid", "invalid_batch", false);
    const invalid = messages.find((message) => !expoTokenPattern.test(message.token));
    if (invalid) throw new PushProviderError("Expo push token format is invalid", "InvalidPushToken", false);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.requestTimeoutMs);
    try {
      const response = await this.fetchImplementation(endpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          ...(this.options.accessToken ? { authorization: `Bearer ${this.options.accessToken}` } : {}),
        },
        body: JSON.stringify(messages.map((message) => ({
          to: message.token,
          title: message.title,
          body: message.body,
          data: message.data,
          priority: "high",
          channelId: "orders",
        }))),
        signal: controller.signal,
      });
      if (!response.ok) {
        const retryable = response.status === 401 || response.status === 403 || response.status === 408 || response.status === 429 || response.status >= 500;
        throw new PushProviderError("Expo push request was rejected", `http_${response.status}`, retryable);
      }
      const payload = await response.json().catch(() => null) as { data?: unknown } | null;
      const tickets = Array.isArray(payload?.data) ? payload.data as ExpoTicket[] : payload?.data ? [payload.data as ExpoTicket] : [];
      if (tickets.length !== messages.length) {
        throw new PushProviderError("Expo push response was malformed", "malformed_response", true);
      }
      return tickets.map((ticket, index) => {
        const deliveryPublicId = messages[index]!.deliveryPublicId;
        if (ticket.status === "ok" && typeof ticket.id === "string" && providerReferencePattern.test(ticket.id)) {
          return { deliveryPublicId, outcome: "accepted", providerReference: ticket.id };
        }
        const errorCode = safeErrorCode(ticket.details?.error, "provider_rejected");
        if (errorCode === "DeviceNotRegistered") {
          return { deliveryPublicId, outcome: "device_not_registered", errorCode };
        }
        return { deliveryPublicId, outcome: "failed", errorCode, retryable: retryableExpoError(errorCode) };
      });
    } catch (error) {
      if (error instanceof PushProviderError) throw error;
      if (controller.signal.aborted) throw new PushProviderError("Expo push request timed out", "request_timeout", true);
      throw new PushProviderError("Expo push request failed", "network_error", true);
    } finally {
      clearTimeout(timeout);
    }
  }
}
