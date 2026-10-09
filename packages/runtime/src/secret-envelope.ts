import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function decodeKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32 || key.toString("base64").replace(/=+$/, "") !== encodedKey.replace(/=+$/, "")) {
    throw new Error("envelope key must be a canonical base64-encoded 32-byte value");
  }
  return key;
}

export function encryptSecret(plaintext: string, encodedKey: string, associatedData: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", decodeKey(encodedKey), nonce);
  cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [nonce, ciphertext, tag].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(envelope: string, encodedKey: string, associatedData: string): string {
  const parts = envelope.split(".");
  if (parts.length !== 3) throw new Error("invalid secret envelope");
  const [noncePart, ciphertextPart, tagPart] = parts as [string, string, string];
  const nonce = Buffer.from(noncePart, "base64url");
  const ciphertext = Buffer.from(ciphertextPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  if (nonce.length !== 12 || tag.length !== 16) throw new Error("invalid secret envelope");

  const decipher = createDecipheriv("aes-256-gcm", decodeKey(encodedKey), nonce);
  decipher.setAAD(Buffer.from(associatedData, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
