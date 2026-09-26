// apps/api/src/common/format/en.ts
//
// English display text produced by the API, for donors who switched the site to English. Same rules
// as fil.ts: Philippine time, and pesos from exact centavos (formatPesoFil, which is language-neutral).
// Dates read the way Philippine English writes them: "Sep 18, 2026".

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 2026-09-18T02:00:00Z -> "Sep 18, 2026" (Philippine time). */
export function formatDateEn(date: Date): string {
  const manila = new Date(date.getTime() + MANILA_OFFSET_MS);
  return `${MONTHS[manila.getUTCMonth()]} ${manila.getUTCDate()}, ${manila.getUTCFullYear()}`;
}
