// apps/api/src/kyc/kyc-policy.ts
//
// The KYC front gate as pure functions. The database enforces the same rule with triggers
// (migration 20260925000200): only an ACTIVE account whose kyc_status is VERIFIED and whose
// kyc_expires_at has not passed can create or publish a campaign, or receive a creator payout.
import type { AccountStatus, GovernmentIdType, KycStatus } from '../generated/prisma/enums.js';

const DAY_MS = 86_400_000;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Verified users may renew during the last 30 days before their verification expires. */
export const REVERIFY_WINDOW_DAYS = 30;

export const KYC_REJECTION_REASONS = [
  'BLURRY_PHOTO',
  'ID_EXPIRED',
  'ID_NOT_ACCEPTED',
  'NAME_MISMATCH',
  'SELFIE_MISMATCH',
  'CHALLENGE_MISSING',
  'SUSPECTED_FRAUD',
  'OTHER',
] as const;
export type KycRejectionReason = (typeof KYC_REJECTION_REASONS)[number];

export interface KycSubject {
  status: AccountStatus;
  deletedAt: Date | null;
  kycStatus: KycStatus;
  kycExpiresAt: Date | null;
}

/** What users and staff see: VERIFIED reads as EXPIRED once kyc_expires_at has passed. */
export function effectiveKycStatus(
  user: Pick<KycSubject, 'kycStatus' | 'kycExpiresAt'>,
  now: Date = new Date(),
): KycStatus {
  if (user.kycStatus === 'VERIFIED' && user.kycExpiresAt && user.kycExpiresAt <= now) return 'EXPIRED';
  return user.kycStatus;
}

/** Same rule as the database triggers: may this user post, publish, or be paid out right now? */
export function canPost(user: KycSubject, now: Date = new Date()): boolean {
  return user.status === 'ACTIVE' && user.deletedAt === null && effectiveKycStatus(user, now) === 'VERIFIED';
}

export type SubmitBlock = 'ALREADY_VERIFIED' | 'PENDING_REVIEW' | 'REVOKED';

/** Why a user may not submit a new identity check right now, or null when they may. */
export function verificationSubmitBlock(
  user: Pick<KycSubject, 'kycStatus' | 'kycExpiresAt'>,
  now: Date = new Date(),
): SubmitBlock | null {
  const status = effectiveKycStatus(user, now);
  if (status === 'PENDING_ID') return 'PENDING_REVIEW';
  if (status === 'REVOKED') return 'REVOKED';
  if (status === 'VERIFIED') {
    const renewalOpens = user.kycExpiresAt
      ? user.kycExpiresAt.getTime() - REVERIFY_WINDOW_DAYS * DAY_MS
      : null;
    if (renewalOpens === null || now.getTime() < renewalOpens) return 'ALREADY_VERIFIED';
  }
  return null;
}

/** A passport has no back side worth photographing; every other accepted ID does. */
export function requiresIdBack(idType: GovernmentIdType): boolean {
  return idType !== 'PASSPORT';
}

function addMonthsClamped(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(date.getUTCDate(), lastDay),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

/** End of a calendar date in Philippine time (UTC+8), as an instant. */
export function endOfManilaDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1) - MANILA_OFFSET_MS,
  );
}

/**
 * Verification lasts `reverifyMonths`, or until the ID itself expires if that comes first, so a
 * creator is never "verified" on an expired ID.
 */
export function kycExpiry(verifiedAt: Date, idExpiresOn: Date | null, reverifyMonths: number): Date {
  const byPolicy = addMonthsClamped(verifiedAt, reverifyMonths);
  if (!idExpiresOn) return byPolicy;
  const idEnd = endOfManilaDay(idExpiresOn);
  return idEnd < byPolicy ? idEnd : byPolicy;
}
