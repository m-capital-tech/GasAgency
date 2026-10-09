const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const format = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function normalizeGstin(value: string): string {
  return value.trim().toUpperCase();
}

export function gstinCheckDigit(firstFourteenCharacters: string): string {
  const input = normalizeGstin(firstFourteenCharacters);
  if (input.length !== 14 || !/^[0-9A-Z]+$/.test(input)) throw new Error("GSTIN checksum input must contain 14 alphanumeric characters");

  let sum = 0;
  for (let index = 0; index < input.length; index += 1) {
    const value = alphabet.indexOf(input[index]!);
    const product = value * ((index % 2) + 1);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return alphabet[(36 - (sum % 36)) % 36]!;
}

export function isValidGstin(value: string): boolean {
  const normalized = normalizeGstin(value);
  return format.test(normalized) && gstinCheckDigit(normalized.slice(0, 14)) === normalized[14];
}
