import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function encodeBase32(value: Buffer): string {
  let bits = 0;
  let accumulator = 0;
  let output = "";
  for (const byte of value) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(accumulator >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(accumulator << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value: string): Buffer {
  let bits = 0;
  let accumulator = 0;
  const bytes: number[] = [];
  for (const character of value.toUpperCase().replace(/=+$/g, "")) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("invalid base32 secret");
    accumulator = (accumulator << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((accumulator >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

export function totpCode(secret: string, step: number, digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = ((digest[offset]! & 0x7f) << 24) | (digest[offset + 1]! << 16) | (digest[offset + 2]! << 8) | digest[offset + 3]!;
  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

export function verifyTotp(secret: string, code: string, now = Date.now(), window = 1): number | null {
  if (!/^[0-9]{6}$/.test(code)) return null;
  const currentStep = Math.floor(now / 30_000);
  const candidate = Buffer.from(code, "utf8");
  for (let offset = -window; offset <= window; offset += 1) {
    const step = currentStep + offset;
    const expected = Buffer.from(totpCode(secret, step), "utf8");
    if (timingSafeEqual(candidate, expected)) return step;
  }
  return null;
}

export function totpUri(issuer: string, account: string, secret: string): string {
  const label = `${issuer}:${account}`.split("/").join("-");
  const query = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${encodeURIComponent(label)}?${query.toString()}`;
}

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z2-7]/g, "");
}

export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const encoded = encodeBase32(randomBytes(5));
    return `${encoded.slice(0, 4)}-${encoded.slice(4, 8)}`;
  });
}

export function hashMfaValue(value: string, pepper: string): Buffer {
  return createHmac("sha256", pepper).update(value, "utf8").digest();
}
