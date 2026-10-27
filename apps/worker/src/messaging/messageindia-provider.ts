import { createHash, createHmac } from "node:crypto";
import type { DeliveryReceipt, MessagingProvider, OutboundMessage } from "./provider";

export type MessageIndiaTransport = "get" | "post";
export type MessageIndiaTemplateName = "tenant_registration" | "platform_access" | "login_otp";

export interface MessageIndiaTemplate {
  id: string;
  text: string;
}

export interface MessageIndiaProviderOptions {
  sendUrl: string;
  transport: MessageIndiaTransport;
  username: string;
  apiKey: string;
  senderName: string;
  entityId: string;
  templates: Partial<Record<MessageIndiaTemplateName, MessageIndiaTemplate>>;
  requestTimeoutMs: number;
  relaySigningSecret?: string;
  allowInsecureHttp?: boolean;
  fetchImplementation?: typeof fetch;
}

const templateParameters: Record<MessageIndiaTemplateName, readonly string[]> = {
  login_otp: ["code"],
  tenant_registration: ["businessName", "servingAgencyName", "appLink", "supportContact"],
  platform_access: [],
};
const referenceKeys = new Set(["id", "messageid", "message_id", "msgid", "msg_id", "requestid", "request_id"]);
const failurePattern = /\b(error|failed|failure|invalid|unauthori[sz]ed|insufficient|rejected)\b/i;

function findReference(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  for (const [key, candidate] of Object.entries(value)) {
    if (referenceKeys.has(key.toLowerCase()) && (typeof candidate === "string" || typeof candidate === "number")) {
      const reference = String(candidate).trim();
      if (reference) return reference;
    }
  }
  for (const candidate of Object.values(value)) {
    const nested = findReference(candidate);
    if (nested) return nested;
  }
  return undefined;
}

function responseFailed(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  for (const key of ["success", "result"]) {
    if (record[key] === false || record[key] === 0 || record[key] === "false") return true;
  }
  const status = record.status;
  return typeof status === "string" && failurePattern.test(status);
}

function renderTemplate(template: MessageIndiaTemplate, parameters: Record<string, string>): string {
  const used = new Set<string>();
  const rendered = template.text.replace(/{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g, (_match, key: string) => {
    const value = parameters[key];
    if (value === undefined) throw new Error(`messageindia template is missing parameter ${key}`);
    used.add(key);
    return value;
  });
  const unused = Object.keys(parameters).filter((key) => !used.has(key));
  if (unused.length) throw new Error(`messageindia template does not use parameter ${unused.join(",")}`);
  if (/{{|}}/.test(rendered)) throw new Error("messageindia template contains an unresolved placeholder");
  return rendered;
}

function providerReference(responseBody: string, idempotencyKey: string): string {
  try {
    const parsed = JSON.parse(responseBody) as unknown;
    const reference = findReference(parsed);
    if (reference) return reference;
  } catch {
    const match = responseBody.match(/(?:message|msg|request)[-_ ]?id[\s:=\"']+([A-Za-z0-9._-]+)/i);
    if (match?.[1]) return match[1];
  }
  return `messageindia-${createHash("sha256").update(`${idempotencyKey}:${responseBody}`).digest("hex").slice(0, 32)}`;
}

export class MessageIndiaProvider implements MessagingProvider {
  readonly name = "messageindia";
  private readonly sendUrl: URL;
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: MessageIndiaProviderOptions) {
    this.sendUrl = new URL(options.sendUrl);
    if (this.sendUrl.protocol !== "https:" && !options.allowInsecureHttp) {
      throw new Error("messageindia send URL must use HTTPS");
    }
    for (const name of Object.keys(options.templates) as MessageIndiaTemplateName[]) {
      if (!options.templates[name]) continue;
      const parameters = Object.fromEntries(templateParameters[name].map((key) => [key, `__${key}__`]));
      renderTemplate(options.templates[name]!, parameters);
    }
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async send(message: OutboundMessage): Promise<DeliveryReceipt> {
    if (message.channel !== "sms") throw new Error("messageindia adapter only supports SMS");
    const template = this.options.templates[message.template.name as MessageIndiaTemplateName];
    if (!template) throw new Error(`messageindia template ${message.template.name} is not configured`);

    const body = renderTemplate(template, message.template.parameters);
    const form = new URLSearchParams({
      username: this.options.username,
      apikey: this.options.apiKey,
      message: body,
      sendername: this.options.senderName,
      smstype: "TRANS",
      numbers: message.destinationE164.slice(1),
      peid: this.options.entityId,
      templateid: template.id,
    });
    const endpoint = new URL(this.sendUrl);
    const request: RequestInit = {
      method: this.options.transport === "post" ? "POST" : "GET",
      headers: { accept: "application/json, text/plain;q=0.9" },
      signal: AbortSignal.timeout(this.options.requestTimeoutMs),
    };
    if (this.options.transport === "post") {
      request.headers = { ...request.headers, "content-type": "application/x-www-form-urlencoded" };
      request.body = form;
      if (this.options.relaySigningSecret) {
        const timestamp = Math.floor(Date.now() / 1_000).toString();
        const signature = createHmac("sha256", this.options.relaySigningSecret)
          .update(`${timestamp}\n${message.idempotencyKey}\n${form.toString()}`)
          .digest("hex");
        request.headers = {
          ...request.headers,
          "x-munna-timestamp": timestamp,
          "x-munna-idempotency-key": message.idempotencyKey,
          "x-munna-signature": `v1=${signature}`,
        };
      }
    } else {
      endpoint.search = form.toString();
    }

    let response: Response;
    try {
      response = await this.fetchImplementation(endpoint, request);
    } catch (error) {
      throw new Error("messageindia request failed before a response was received", { cause: error });
    }
    const responseBody = (await response.text()).trim();
    if (!response.ok) throw new Error(`messageindia request failed with HTTP ${response.status}`);
    if (!responseBody) throw new Error("messageindia returned an empty response");

    let parsed: unknown;
    try {
      parsed = JSON.parse(responseBody) as unknown;
    } catch {
      parsed = undefined;
    }
    if (responseFailed(parsed) || (parsed === undefined && failurePattern.test(responseBody))) {
      throw new Error("messageindia rejected the message request");
    }

    return {
      provider: this.name,
      providerReference: providerReference(responseBody, message.idempotencyKey),
      status: "sent",
    };
  }
}
