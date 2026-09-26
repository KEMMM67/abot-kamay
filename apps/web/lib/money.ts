// apps/web/lib/money.ts
//
// Philippine peso helpers that never touch floating point. The API sends money as BigInt strings in
// centavos, and everything here works on bigint, so PHP 1,250.50 stays exactly 125050 centavos.
// Formatting is done by hand rather than with Intl, so the server and the browser always render the
// same text (different ICU data would otherwise cause hydration mismatches).
import type { MinorUnits } from './types';

/** Smallest donation: PHP 20.00. A minimum also blunts card-testing attacks (AK-DON-002). */
export const MIN_DONATION_MINOR = 2_000n;

/** Largest single online donation the form accepts. The server remains the authority on limits. */
export const MAX_DONATION_MINOR = 100_000_000n; // PHP 1,000,000.00

export function toMinor(value: MinorUnits | bigint): bigint {
  if (typeof value === 'bigint') return value;
  if (!/^-?\d+$/.test(value)) throw new RangeError(`Not an amount in minor units: "${value}"`);
  return BigInt(value);
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 1204 -> "1,204". */
export function formatCount(value: number): string {
  return groupThousands(String(Math.trunc(value)));
}

export interface FormatPesoOptions {
  /** 'auto' drops .00 on whole pesos (₱500); 'always' keeps it (₱500.00). */
  cents?: 'auto' | 'always';
}

/** "312550" -> "₱3,125.50"; "50000" -> "₱500", or "₱500.00" with { cents: 'always' }. */
export function formatPeso(value: MinorUnits | bigint, { cents = 'auto' }: FormatPesoOptions = {}): string {
  const minor = toMinor(value);
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  const whole = groupThousands((absolute / 100n).toString());
  const centavos = (absolute % 100n).toString().padStart(2, '0');
  const amount = cents === 'always' || centavos !== '00' ? `${whole}.${centavos}` : whole;
  return `${negative ? '−' : ''}₱${amount}`;
}

export interface FundingProgress {
  /** Whole percent, rounded down so 99.6% never reads as "100%". Above 100 when overfunded. */
  percent: number;
  /** Width of the progress bar fill, 0 to 100. */
  fill: number;
  complete: boolean;
  /** "67%", or "<1%" for a first small donation, so a campaign with donations never shows "0%". */
  label: string;
}

export function fundingProgress(raised: MinorUnits | bigint, goal: MinorUnits | bigint): FundingProgress {
  const raisedMinor = toMinor(raised);
  const goalMinor = toMinor(goal);
  if (goalMinor <= 0n) return { percent: 0, fill: 0, complete: false, label: '0%' };

  const basisPoints = (raisedMinor * 10_000n) / goalMinor;
  const percent = Number(basisPoints / 100n);
  const label = percent === 0 && raisedMinor > 0n ? '<1%' : `${percent}%`;
  return {
    percent,
    fill: Math.min(100, Number(basisPoints) / 100),
    complete: raisedMinor >= goalMinor,
    label,
  };
}

export type AmountParseResult =
  { ok: true; minor: bigint } | { ok: false; reason: 'EMPTY' | 'INVALID' | 'TOO_SMALL' | 'TOO_LARGE' };

// Digits with optional correct thousands separators, then up to two decimals: 500, 1,250.50, 20.
const AMOUNT_PATTERN = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{0,2})?$/;

/** Parses a peso amount with explicit limits, e.g. a creator's plan item or a receipt total. */
export function parsePesoAmount(raw: string, { min, max }: { min: bigint; max: bigint }): AmountParseResult {
  const text = raw.trim().replace(/^(?:₱|php)\s*/i, '');
  if (text === '') return { ok: false, reason: 'EMPTY' };
  if (!AMOUNT_PATTERN.test(text)) return { ok: false, reason: 'INVALID' };

  const [whole = '0', fraction = ''] = text.replaceAll(',', '').split('.');
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (minor < min) return { ok: false, reason: 'TOO_SMALL' };
  if (minor > max) return { ok: false, reason: 'TOO_LARGE' };
  return { ok: true, minor };
}

export type AmountProblem = Extract<AmountParseResult, { ok: false }>['reason'];

/**
 * Parses what a donor types into centavos. Accepts "500", "1,250.50", "₱500" and "PHP 500". Rejects
 * scientific notation ("1e3"), signs, a third decimal and stray characters instead of guessing,
 * because a guessed amount is a wrong charge (QA scenarios DON-004 and DON-006).
 */
export function parsePesoInput(raw: string): AmountParseResult {
  return parsePesoAmount(raw, { min: MIN_DONATION_MINOR, max: MAX_DONATION_MINOR });
}
