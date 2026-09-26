// apps/api/src/campaigns/campaign-policy.ts
//
// Rules for a creator's post, as pure functions:
//   - Funding: FIXED posts list what the money is for, each with an amount, and the goal is exactly
//     their sum (no round-number padding). OPEN_ENDED posts list uses without a goal.
//   - Consent: the person in the post agreed, and the evidence is attached (unless the creator is the
//     person helped). Minors need a parent or guardian and blurred faces.
//   - Slugs and the policy text for money beyond the goal.
import { randomBytes } from 'node:crypto';
import { formatPesoFil } from '../common/format/fil.js';
import type { CreatorRelationship, FundingType } from '../generated/prisma/enums.js';

export const NEED_CATEGORIES = ['MOBILITY', 'MEDICAL', 'LIVELIHOOD', 'HOUSING', 'FOOD', 'EDUCATION'] as const;
export type NeedCategory = (typeof NEED_CATEGORIES)[number];

export const AGE_BANDS = [
  '0-17',
  '18-29',
  '30-39',
  '40-49',
  '50-59',
  '60-69',
  '70-79',
  '80-89',
  '90+',
] as const;

export const CONSENT_METHODS = ['SELF', 'VIDEO', 'SIGNED_FORM', 'GUARDIAN'] as const;
export type ConsentMethod = (typeof CONSENT_METHODS)[number];

export const PAYOUT_CHOICES = ['CREATOR', 'DIRECT_TO_PROVIDER'] as const;
export type PayoutChoice = (typeof PAYOUT_CHOICES)[number];

export const MIN_ITEM_MINOR = 100n; // ₱1
export const MIN_FIXED_GOAL_MINOR = 50_000n; // ₱500
export const MAX_GOAL_MINOR = 500_000_000n; // ₱5,000,000
export const MAX_PLAN_ITEMS = 6;
export const MAX_POST_MEDIA = 10;

/** Statuses that count against a creator's limit of open campaigns. */
export const OPEN_STATUSES = ['PENDING_REVIEW', 'ACTIVE', 'PAUSED', 'FUNDED', 'UNDER_INVESTIGATION'] as const;

/** Statuses anyone may see. DRAFT, PENDING_REVIEW and CANCELLED stay private to the creator. */
export const PUBLIC_STATUSES = ['ACTIVE', 'PAUSED', 'FUNDED', 'UNDER_INVESTIGATION', 'CLOSED'] as const;

export interface PlanItemInput {
  title: string;
  description?: string | undefined;
  amountMinor?: bigint | undefined;
  payout: PayoutChoice;
}

export interface PolicyIssue {
  path: string;
  message: string;
  code: string;
}

export type FundingPlanCheck = { ok: true; goalMinor: bigint | null } | { ok: false; issues: PolicyIssue[] };

export function checkFundingPlan(
  fundingType: FundingType,
  items: readonly PlanItemInput[],
): FundingPlanCheck {
  const issues: PolicyIssue[] = [];
  if (items.length === 0 || items.length > MAX_PLAN_ITEMS) {
    issues.push({
      path: 'plan',
      message: `List 1 to ${MAX_PLAN_ITEMS} uses for the money`,
      code: 'PLAN_SIZE',
    });
  }

  let total = 0n;
  items.forEach((item, index) => {
    const amount = item.amountMinor;
    if (amount === undefined) {
      if (fundingType === 'FIXED') {
        issues.push({
          path: `plan.${index}.amountMinor`,
          message: 'A fixed goal needs an amount for every item',
          code: 'AMOUNT_REQUIRED',
        });
      }
      return;
    }
    if (amount < MIN_ITEM_MINOR || amount > MAX_GOAL_MINOR) {
      issues.push({
        path: `plan.${index}.amountMinor`,
        message: 'Amount is out of range',
        code: 'AMOUNT_RANGE',
      });
      return;
    }
    total += amount;
  });

  if (fundingType === 'FIXED' && issues.length === 0) {
    if (total < MIN_FIXED_GOAL_MINOR || total > MAX_GOAL_MINOR) {
      issues.push({
        path: 'plan',
        message: `The goal must be between ${formatPesoFil(MIN_FIXED_GOAL_MINOR)} and ${formatPesoFil(MAX_GOAL_MINOR)}`,
        code: 'GOAL_RANGE',
      });
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, goalMinor: fundingType === 'FIXED' ? total : null };
}

export interface ConsentInput {
  relationship: CreatorRelationship;
  beneficiaryIsMinor: boolean;
  method: ConsentMethod;
  hasEvidence: boolean;
  anyMediaShowsMinor: boolean;
}

/**
 * Consent is the line between help and exploitation (brand/BRAND.md dignity policy):
 *   - SELF is only for creators posting about themselves (they passed KYC, so they are adults);
 *   - anyone else needs the person's recorded consent (video or signed form) attached as evidence;
 *   - a minor needs a parent's or guardian's consent, cannot be posted by a passer-by, and every
 *     photo of them is marked so faces are blurred before publishing.
 */
export function checkConsent(input: ConsentInput): PolicyIssue[] {
  const issues: PolicyIssue[] = [];
  if (input.relationship === 'SELF') {
    if (input.beneficiaryIsMinor) {
      issues.push({
        path: 'beneficiary.isMinor',
        message: 'A verified creator cannot be a minor',
        code: 'SELF_MINOR',
      });
    }
    if (input.method !== 'SELF') {
      issues.push({
        path: 'consent.method',
        message: 'Use SELF when you are the person helped',
        code: 'CONSENT_METHOD',
      });
    }
    return issues;
  }

  if (input.method === 'SELF') {
    issues.push({
      path: 'consent.method',
      message: 'Record the consent of the person helped',
      code: 'CONSENT_METHOD',
    });
  }
  if (!input.hasEvidence) {
    issues.push({
      path: 'consent.evidenceMediaId',
      message: 'Attach the consent video or the signed consent form',
      code: 'CONSENT_EVIDENCE_REQUIRED',
    });
  }
  if (input.beneficiaryIsMinor) {
    if (input.method !== 'GUARDIAN') {
      issues.push({
        path: 'consent.method',
        message: "A minor needs a parent's or guardian's consent",
        code: 'GUARDIAN_REQUIRED',
      });
    }
    if (input.relationship === 'PASSERBY') {
      issues.push({
        path: 'relationship',
        message: 'Minors cannot be posted by a passer-by',
        code: 'MINOR_PASSERBY',
      });
    }
    if (!input.anyMediaShowsMinor) {
      issues.push({
        path: 'media',
        message: 'Mark the photos that show the child',
        code: 'MINOR_MEDIA_UNMARKED',
      });
    }
  }
  return issues;
}

/** "Gamot ni Lolo Ben, Quezon City!" -> "gamot-ni-lolo-ben-quezon-city" */
export function slugify(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // ñ -> n, é -> e
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= 60) return slug;
  const cut = slug.slice(0, 60);
  const lastDash = cut.lastIndexOf('-');
  return lastDash > 20 ? cut.slice(0, lastDash) : cut;
}

/** Readable and unique: the title's slug plus 6 random characters, e.g. "gamot-ni-lolo-ben-k3x9qa". */
export function newCampaignSlug(title: string): string {
  const suffix = Array.from(randomBytes(6), (byte) => '0123456789abcdefghijklmnopqrstuvwxyz'[byte % 36]).join(
    '',
  );
  return `${slugify(title) || 'tulong'}-${suffix}`;
}

/**
 * Shown before anyone donates (TECHNICAL_PLAN.md 1.2 step 6: "no silent surplus"). The Filipino text
 * is stored with the campaign when it is posted; English is rendered from the same facts on read.
 */
export function excessFundsPolicyText(
  fundingType: FundingType,
  alias: string,
  goalMinor: bigint | null,
  lang: 'fil' | 'en' = 'fil',
): string {
  if (fundingType === 'OPEN_ENDED' || goalMinor === null) {
    return lang === 'en'
      ? `This campaign has no set goal. Everything received goes only to the listed uses for ${alias}, ` +
          'and the creator posts a receipt for every expense.'
      : 'Walang takdang halaga ang kampanyang ito. Lahat ng matatanggap ay para lang sa mga nakalistang ' +
          `gamit para kay ${alias}, at ipo-post ng creator ang resibo ng bawat gastos.`;
  }
  return lang === 'en'
    ? `Donations close once ${formatPesoFil(goalMinor)} is reached. If donations arriving at the same ` +
        `time go over the goal, the extra still goes to the same need of ${alias}, with receipts.`
    : `Kapag naabot na ang ${formatPesoFil(goalMinor)}, isasara na ang donasyon. Kung may sumobra dahil ` +
        `sabay-sabay dumating ang mga donasyon, gagamitin pa rin ito para sa parehong pangangailangan ni ${alias}, ` +
        'at ipo-post din ang resibo.';
}

/** First paragraph of the caption, cut at a word boundary: the card summary in the feed. */
export function captionSummary(caption: string, maxLength = 160): string {
  const first =
    caption
      .split(/\n{2,}/)[0]
      ?.trim()
      .replace(/\s+/g, ' ') ?? '';
  if (first.length <= maxLength) return first;
  const cut = first.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:!?-]+$/, '')}…`;
}
