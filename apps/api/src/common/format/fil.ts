// apps/api/src/common/format/fil.ts
//
// Filipino display text produced by the API (timeline steps, verification checks, policies). Same
// conventions as the web app (apps/web/lib/format.ts, lib/money.ts): Philippine time, Filipino month
// abbreviations, and pesos from exact centavos, never floating point.

const MONTHS = ['Ene', 'Peb', 'Mar', 'Abr', 'May', 'Hun', 'Hul', 'Ago', 'Set', 'Okt', 'Nob', 'Dis'] as const;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 2026-09-18T02:00:00Z -> "18 Set 2026" (Philippine time). */
export function formatDateFil(date: Date): string {
  const manila = new Date(date.getTime() + MANILA_OFFSET_MS);
  return `${manila.getUTCDate()} ${MONTHS[manila.getUTCMonth()]} ${manila.getUTCFullYear()}`;
}

/** Today's calendar date in the Philippines, as YYYY-MM-DD. */
export function manilaToday(now: Date = new Date()): string {
  return new Date(now.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

/** 4620000n -> "₱46,200"; 312550n -> "₱3,125.50". */
export function formatPesoFil(minor: bigint): string {
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  const whole = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const centavos = (absolute % 100n).toString().padStart(2, '0');
  return `${negative ? '−' : ''}₱${centavos === '00' ? whole : `${whole}.${centavos}`}`;
}
