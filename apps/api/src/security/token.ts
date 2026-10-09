import { createHmac } from "node:crypto";

export function hashSessionToken(token: string, pepper: string): Buffer {
  return createHmac("sha256", pepper).update(token, "utf8").digest();
}
