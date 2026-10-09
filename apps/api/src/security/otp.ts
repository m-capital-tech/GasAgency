import { createHmac, timingSafeEqual } from "node:crypto";

export function hashOtpCode(challengePublicId: string, code: string, pepper: string): Buffer {
  return createHmac("sha256", pepper).update(`otp:${challengePublicId}:${code}`, "utf8").digest();
}

export function hashRateKey(kind: "phone" | "ip", value: string, pepper: string): Buffer {
  return createHmac("sha256", pepper).update(`rate:${kind}:${value}`, "utf8").digest();
}

export function otpMatches(expectedHash: Buffer, candidateHash: Buffer): boolean {
  return expectedHash.length === candidateHash.length && timingSafeEqual(expectedHash, candidateHash);
}

export function maskPhone(phoneE164: string): string {
  return `${phoneE164.slice(0, 3)}••••••${phoneE164.slice(-3)}`;
}
