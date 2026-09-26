// apps/web/lib/phone.ts

/**
 * Normalizes a Philippine mobile number to E.164 (+639XXXXXXXXX). Accepts the ways people copy numbers
 * out of comments: "0917 123 4567", "0917-123-4567", "(0917) 123.4567", "+63 917 123 4567",
 * "639171234567" and "9171234567". Returns null for anything else.
 */
export function normalizePhMobile(raw: string): string | null {
  const compact = raw.trim().replace(/[\s\-().]/g, '');
  const match = /^(?:\+?63|0)?(9\d{9})$/.exec(compact);
  return match ? `+63${match[1]}` : null;
}

/** "+639171234567" -> "0917 123 4567", the way Filipinos write mobile numbers. */
export function formatPhMobile(e164: string): string {
  const local = e164.replace(/^\+63/, '0');
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}
