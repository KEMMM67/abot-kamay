// apps/api/src/kyc/kyc-challenge.ts
//
// One-time challenge code for the KYC selfie. The user writes the code on paper and holds it next to
// their face and their ID, which defeats replaying a stolen ID photo or an old selfie (the same idea
// as the challenge code in field verification, TECHNICAL_PLAN.md 1.2).
//
// Stateless: the code travels in a token signed with AUTH_SECRET, bound to the user and an expiry, so
// nothing is stored until the user actually submits.
import { createHmac, randomInt } from 'node:crypto';
import { safeEqual } from '../common/crypto/safe-compare.js';

/** No 0/O, 1/I/L: easy to write by hand and read back from a photo. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
export const KYC_CHALLENGE_TTL_MS = 60 * 60 * 1000;
export const KYC_CHALLENGE_PATTERN = /^AK-[A-HJKMNP-Z2-9]{6}$/;

export interface IssuedChallenge {
  code: string;
  token: string;
  expiresAt: Date;
}

export type ChallengeCheck =
  | { ok: true; code: string }
  | { ok: false; reason: 'MALFORMED' | 'BAD_SIGNATURE' | 'WRONG_USER' | 'EXPIRED' };

function sign(secret: Buffer, payload: string): string {
  return createHmac('sha256', secret).update(`kyc-challenge:v1:${payload}`, 'utf8').digest('base64url');
}

export function issueKycChallenge(secret: Buffer, userId: string, now: number = Date.now()): IssuedChallenge {
  let random = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) random += ALPHABET[randomInt(ALPHABET.length)];
  const code = `AK-${random}`;
  const expiresAt = new Date(now + KYC_CHALLENGE_TTL_MS);
  const payload = Buffer.from(`${userId}|${code}|${expiresAt.getTime()}`, 'utf8').toString('base64url');
  return { code, token: `${payload}.${sign(secret, payload)}`, expiresAt };
}

export function verifyKycChallenge(
  secret: Buffer,
  userId: string,
  token: string,
  now: number = Date.now(),
): ChallengeCheck {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) return { ok: false, reason: 'MALFORMED' };
  if (!safeEqual(signature, sign(secret, payload))) return { ok: false, reason: 'BAD_SIGNATURE' };

  const [tokenUser, code, expiresAtText] = Buffer.from(payload, 'base64url').toString('utf8').split('|');
  const expiresAt = Number(expiresAtText);
  if (!tokenUser || !code || !KYC_CHALLENGE_PATTERN.test(code) || !Number.isSafeInteger(expiresAt)) {
    return { ok: false, reason: 'MALFORMED' };
  }
  if (tokenUser !== userId) return { ok: false, reason: 'WRONG_USER' };
  if (expiresAt <= now) return { ok: false, reason: 'EXPIRED' };
  return { ok: true, code };
}
