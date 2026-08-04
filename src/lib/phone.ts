export function normalizeGTPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 8) {
    return `+502${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("502")) {
    return `+${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("502")) {
    return `+${digits}`;
  }
  if (digits.length > 8) {
    return `+502${digits.slice(-8)}`;
  }
  return `+502${digits}`;
}

export function formatGTPhone(phone: string): string {
  const digits = normalizeGTPhone(phone).replace(/\D/g, "").slice(-8);
  return `${digits.slice(0, 4)} ${digits.slice(4)}`;
}

export function phoneMatch(phone1: string, phone2: string): boolean {
  return normalizeGTPhone(phone1) === normalizeGTPhone(phone2);
}
