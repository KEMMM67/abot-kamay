// apps/api/src/kyc/kyc-policy.spec.ts
import {
  canPost,
  effectiveKycStatus,
  kycExpiry,
  requiresIdBack,
  verificationSubmitBlock,
  type KycSubject,
} from './kyc-policy.js';

const NOW = new Date('2026-09-25T04:00:00.000Z');
const DAY = 86_400_000;

function user(overrides: Partial<KycSubject> = {}): KycSubject {
  return { status: 'ACTIVE', deletedAt: null, kycStatus: 'UNVERIFIED', kycExpiresAt: null, ...overrides };
}

describe('the KYC front gate', () => {
  it('lets only active, verified, unexpired users post', () => {
    const verified = user({ kycStatus: 'VERIFIED', kycExpiresAt: new Date(NOW.getTime() + DAY) });
    expect(canPost(verified, NOW)).toBe(true);
    expect(canPost(user(), NOW)).toBe(false);
    expect(canPost(user({ kycStatus: 'PENDING_ID' }), NOW)).toBe(false);
    expect(canPost(user({ kycStatus: 'REVOKED' }), NOW)).toBe(false);
    expect(canPost({ ...verified, status: 'SUSPENDED' }, NOW)).toBe(false);
    expect(canPost({ ...verified, deletedAt: NOW }, NOW)).toBe(false);
  });

  it('treats a lapsed verification as EXPIRED', () => {
    const lapsed = user({ kycStatus: 'VERIFIED', kycExpiresAt: new Date(NOW.getTime() - 1) });
    expect(effectiveKycStatus(lapsed, NOW)).toBe('EXPIRED');
    expect(canPost(lapsed, NOW)).toBe(false);
  });
});

describe('verificationSubmitBlock', () => {
  it('blocks a second submission while one is being reviewed, and revoked users', () => {
    expect(verificationSubmitBlock(user({ kycStatus: 'PENDING_ID' }), NOW)).toBe('PENDING_REVIEW');
    expect(verificationSubmitBlock(user({ kycStatus: 'REVOKED' }), NOW)).toBe('REVOKED');
  });

  it('lets unverified, rejected and expired users submit', () => {
    expect(verificationSubmitBlock(user(), NOW)).toBeNull();
    expect(verificationSubmitBlock(user({ kycStatus: 'REJECTED' }), NOW)).toBeNull();
    expect(verificationSubmitBlock(user({ kycStatus: 'EXPIRED' }), NOW)).toBeNull();
  });

  it('opens renewal in the last 30 days of a verification', () => {
    const far = user({ kycStatus: 'VERIFIED', kycExpiresAt: new Date(NOW.getTime() + 60 * DAY) });
    const near = user({ kycStatus: 'VERIFIED', kycExpiresAt: new Date(NOW.getTime() + 10 * DAY) });
    expect(verificationSubmitBlock(far, NOW)).toBe('ALREADY_VERIFIED');
    expect(verificationSubmitBlock(near, NOW)).toBeNull();
  });
});

describe('kycExpiry', () => {
  it('lasts the policy period when the ID expires later', () => {
    expect(kycExpiry(NOW, new Date('2031-01-01'), 24).toISOString()).toBe('2028-09-25T04:00:00.000Z');
  });

  it('ends with the ID when the ID expires first (end of that day, Philippine time)', () => {
    expect(kycExpiry(NOW, new Date('2027-03-15'), 24).toISOString()).toBe('2027-03-15T16:00:00.000Z');
  });

  it('clamps month ends instead of rolling over', () => {
    expect(kycExpiry(new Date('2026-08-31T00:00:00.000Z'), null, 6).toISOString()).toBe(
      '2027-02-28T00:00:00.000Z',
    );
  });
});

it('needs the back of every accepted ID except a passport', () => {
  expect(requiresIdBack('PASSPORT')).toBe(false);
  expect(requiresIdBack('PHILSYS')).toBe(true);
  expect(requiresIdBack('DRIVERS_LICENSE')).toBe(true);
});
