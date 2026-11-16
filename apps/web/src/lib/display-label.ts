// Stored scope, permission and audit keys also appear in older records.
export function displayLabel(value: string): string {
  return value.replace(/(?<![a-z0-9])tenant(s?)(?![a-z0-9])/gi, (word, plural: string) =>
    (word[0] === "T" ? "Vendor" : "vendor") + plural.toLowerCase(),
  );
}
