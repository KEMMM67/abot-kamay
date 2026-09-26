// apps/api/src/kyc/kyc-challenge.spec.ts
import {
  issueKycChallenge,
  KYC_CHALLENGE_PATTERN,
  KYC_CHALLENGE_TTL_MS,
  verifyKycChallenge,
} from './kyc-challenge.js';

const SECRET = Buffer.from('k'.repeat(32));
const USER = '0199837a-4c1e-7b2a-9d4e-6f1a2b3c4d01';
const NOW = Date.parse('2026-09-25T04:00:00.000Z');

describe('KYC challenge codes', () => {
  it('issue a readable code bound to the user for one hour', () => {
    const challenge = issueKycChallenge(SECRET, USER, NOW);
    expect(challenge.code).toMatch(KYC_CHALLENGE_PATTERN);
    expect(challenge.code.slice(3)).not.toMatch(/[01IOL]/); // nothing easy to misread in handwriting
    expect(challenge.expiresAt.getTime()).toBe(NOW + KYC_CHALLENGE_TTL_MS);
    expect(verifyKycChallenge(SECRET, USER, challenge.token, NOW + 1000)).toEqual({
      ok: true,
      code: challenge.code,
    });
  });

  it('reject another user, an expired token, a tampered token and a different secret', () => {
    const { token } = issueKycChallenge(SECRET, USER, NOW);
    expect(verifyKycChallenge(SECRET, 'someone-else', token, NOW)).toEqual({
      ok: false,
      reason: 'WRONG_USER',
    });
    expect(verifyKycChallenge(SECRET, USER, token, NOW + KYC_CHALLENGE_TTL_MS)).toEqual({
      ok: false,
      reason: 'EXPIRED',
    });
    const [payload, signature] = token.split('.');
    const forged = Buffer.from(`${USER}|AK-AAAAAA|${NOW + KYC_CHALLENGE_TTL_MS}`).toString('base64url');
    expect(verifyKycChallenge(SECRET, USER, `${forged}.${signature}`, NOW)).toEqual({
      ok: false,
      reason: 'BAD_SIGNATURE',
    });
    expect(verifyKycChallenge(Buffer.from('x'.repeat(32)), USER, token, NOW)).toEqual({
      ok: false,
      reason: 'BAD_SIGNATURE',
    });
    expect(verifyKycChallenge(SECRET, USER, `${payload}`, NOW)).toEqual({ ok: false, reason: 'MALFORMED' });
  });
});
