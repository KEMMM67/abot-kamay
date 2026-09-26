// apps/web/lib/format.ts
//
// Dates, ages and statuses for display, in Filipino or English. Dates are formatted by hand in
// Philippine time (UTC+8, no daylight saving), so the server and the browser always render the same
// string, whatever ICU data or time zone the browser has. The words for API enums live in the
// dictionaries (lib/i18n/messages, `labels`); this file keeps what is logic: tones and date grammar.
import type { Locale } from './i18n/config';
import type { Messages } from './i18n/messages/fil';
import type { CampaignStatus, KycStatus, Milestone, ProofStatus } from './types';

const MONTHS: Record<Locale, readonly string[]> = {
  fil: ['Ene', 'Peb', 'Mar', 'Abr', 'May', 'Hun', 'Hul', 'Ago', 'Set', 'Okt', 'Nob', 'Dis'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

function inManila(iso: string): Date {
  return new Date(Date.parse(iso) + MANILA_OFFSET_MS);
}

function dayMonthYear(locale: Locale, day: number, monthIndex: number, year: number): string {
  const month = MONTHS[locale][monthIndex] ?? '';
  // Filipino writes "18 Set 2026"; Philippine English writes "Sep 18, 2026".
  return locale === 'en' ? `${month} ${day}, ${year}` : `${day} ${month} ${year}`;
}

/** "2026-09-18T02:00:00Z" -> "18 Set 2026" / "Sep 18, 2026" */
export function formatDate(iso: string, locale: Locale): string {
  const date = inManila(iso);
  return dayMonthYear(locale, date.getUTCDate(), date.getUTCMonth(), date.getUTCFullYear());
}

/** "2026-09-24" (a calendar date, e.g. on a receipt) -> "24 Set 2026" / "Sep 24, 2026" */
export function formatCalendarDate(isoDate: string, locale: Locale): string {
  const [year = 0, month = 1, day = 1] = isoDate.split('-').map(Number);
  return dayMonthYear(locale, day, month - 1, year);
}

/** "2026-09-18T02:00:00Z" -> "18 Set 2026, 10:00 AM" / "Sep 18, 2026, 10:00 AM" */
export function formatDateTime(iso: string, locale: Locale): string {
  const date = inManila(iso);
  const hours = date.getUTCHours();
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${formatDate(iso, locale)}, ${hours % 12 || 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
}

/** Today's date in the Philippines, "2026-09-25": the default and the maximum for receipt dates. */
export function manilaToday(now: number = Date.now()): string {
  return new Date(now + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

const TIME_AGO: Record<
  Locale,
  {
    now: string;
    minutes: (count: number) => string;
    hours: (count: number) => string;
    yesterday: string;
    days: (count: number) => string;
  }
> = {
  fil: {
    now: 'ngayon lang',
    minutes: (count) => `${count} minuto na ang nakalipas`,
    hours: (count) => `${count} oras na ang nakalipas`,
    yesterday: 'kahapon',
    days: (count) => `${count} araw na ang nakalipas`,
  },
  en: {
    now: 'just now',
    minutes: (count) => `${count} ${count === 1 ? 'minute' : 'minutes'} ago`,
    hours: (count) => `${count} ${count === 1 ? 'hour' : 'hours'} ago`,
    yesterday: 'yesterday',
    days: (count) => `${count} days ago`,
  },
};

/**
 * "3 araw na ang nakalipas" / "3 days ago". Rendered on the server for the cached feed, so it is only
 * as fresh as the page (30 seconds); older than a week shows the date instead.
 */
export function formatTimeAgo(iso: string, locale: Locale, now: number = Date.now()): string {
  const words = TIME_AGO[locale];
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return words.now;
  if (minutes < 60) return words.minutes(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return words.hours(hours);
  const days = Math.floor(hours / 24);
  if (days === 1) return words.yesterday;
  if (days < 7) return words.days(days);
  return formatDate(iso, locale);
}

/** "70-79" -> "nasa 70s" / "in their 70s". Age bands replace birth dates for privacy. */
export function formatAgeBand(ageBand: string | null, locale: Locale): string | null {
  if (!ageBand) return null;
  if (ageBand === '0-17') return locale === 'en' ? 'minor' : 'menor de edad';
  const decade = ageBand === '90+' ? '90' : /^(\d{2})-\d{2}$/.exec(ageBand)?.[1];
  if (!decade) return ageBand;
  return locale === 'en' ? `in their ${decade}s` : `nasa ${decade}s`;
}

/** "0.9500" -> "95%" */
export function formatRate(rate: string | null): string | null {
  if (rate === null) return null;
  const value = Number(rate);
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : null;
}

/** "Ana R." -> "AR", for the round avatar next to a creator's name. */
export function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}]/gu, '')[0] ?? '')
    .filter(Boolean);
  return (letters.slice(0, 2).join('') || 'AK').toUpperCase();
}

/** Brand money states: teal = verified or paid out, gold = in progress, coral = needs attention. */
export type Tone = 'teal' | 'gold' | 'coral' | 'neutral';

export const KYC_STATUS_TONES: Record<KycStatus, Tone> = {
  UNVERIFIED: 'neutral',
  PENDING_ID: 'gold',
  VERIFIED: 'teal',
  REJECTED: 'coral',
  EXPIRED: 'coral',
  REVOKED: 'coral',
};

export const CAMPAIGN_STATUS_TONES: Record<CampaignStatus, Tone> = {
  DRAFT: 'neutral',
  PENDING_REVIEW: 'gold',
  ACTIVE: 'teal',
  PAUSED: 'gold',
  FUNDED: 'teal',
  UNDER_INVESTIGATION: 'coral',
  CLOSED: 'neutral',
  CANCELLED: 'coral',
};

export const PROOF_STATUS_TONES: Record<ProofStatus, Tone> = {
  SUBMITTED: 'gold',
  AI_CHECKED: 'gold',
  VERIFIED: 'teal',
  REJECTED: 'coral',
};

const MILESTONE_TONES: Record<Milestone['status'], Tone> = {
  PLANNED: 'neutral',
  FUNDED: 'gold',
  DISBURSEMENT_REQUESTED: 'gold',
  DISBURSED: 'teal',
  PROOF_SUBMITTED: 'teal',
  PROOF_VERIFIED: 'teal',
  PROOF_OVERDUE: 'coral',
};

/** A plan item's status as a chip; paid-out and overdue items say when the receipt is due. */
export function milestoneStatus(
  milestone: Milestone,
  words: Messages['labels']['milestoneStatus'],
  locale: Locale,
): { label: string; tone: Tone } {
  const showsDue = milestone.status === 'DISBURSED' || milestone.status === 'PROOF_OVERDUE';
  const due =
    showsDue && milestone.proofDueAt
      ? words.receiptDue.replace('{date}', formatDate(milestone.proofDueAt, locale))
      : '';
  return { label: `${words[milestone.status]}${due}`, tone: MILESTONE_TONES[milestone.status] };
}

/** True when the campaign takes donations right now. */
export function acceptsDonations(status: CampaignStatus): boolean {
  return status === 'ACTIVE';
}
