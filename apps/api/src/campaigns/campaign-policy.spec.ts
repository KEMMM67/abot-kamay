// apps/api/src/campaigns/campaign-policy.spec.ts
import {
  captionSummary,
  checkConsent,
  checkFundingPlan,
  excessFundsPolicyText,
  newCampaignSlug,
  slugify,
  type ConsentInput,
  type PlanItemInput,
} from './campaign-policy.js';

const item = (amountMinor?: bigint, title = 'Gamot'): PlanItemInput => ({
  title,
  amountMinor,
  payout: 'CREATOR',
});

describe('checkFundingPlan', () => {
  it('makes a FIXED goal exactly the sum of its items', () => {
    expect(checkFundingPlan('FIXED', [item(1_800_000n), item(2_400_000n), item(420_000n)])).toEqual({
      ok: true,
      goalMinor: 4_620_000n,
    });
  });

  it('requires an amount for every FIXED item', () => {
    const result = checkFundingPlan('FIXED', [item(1_800_000n), item(undefined)]);
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: 'plan.1.amountMinor', code: 'AMOUNT_REQUIRED' }],
    });
  });

  it('keeps FIXED goals between ₱500 and ₱5,000,000', () => {
    expect(checkFundingPlan('FIXED', [item(49_999n)])).toMatchObject({
      ok: false,
      issues: [{ code: 'GOAL_RANGE' }],
    });
    expect(checkFundingPlan('FIXED', [item(300_000_000n), item(300_000_000n)])).toMatchObject({
      ok: false,
      issues: [{ code: 'GOAL_RANGE' }],
    });
  });

  it('gives OPEN_ENDED campaigns no goal, with or without item amounts', () => {
    expect(checkFundingPlan('OPEN_ENDED', [item(undefined, 'Bigas at ulam'), item(150_000n)])).toEqual({
      ok: true,
      goalMinor: null,
    });
  });

  it('needs 1 to 6 items', () => {
    expect(checkFundingPlan('OPEN_ENDED', [])).toMatchObject({ ok: false, issues: [{ code: 'PLAN_SIZE' }] });
    expect(
      checkFundingPlan(
        'OPEN_ENDED',
        Array.from({ length: 7 }, () => item()),
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'PLAN_SIZE' }],
    });
  });
});

describe('checkConsent', () => {
  const base: ConsentInput = {
    relationship: 'FRIEND_OR_NEIGHBOR',
    beneficiaryIsMinor: false,
    method: 'VIDEO',
    hasEvidence: true,
    anyMediaShowsMinor: false,
  };
  const codes = (input: Partial<ConsentInput>) =>
    checkConsent({ ...base, ...input }).map((issue) => issue.code);

  it('accepts recorded consent with evidence, and creators posting about themselves', () => {
    expect(codes({})).toEqual([]);
    expect(codes({ relationship: 'SELF', method: 'SELF', hasEvidence: false })).toEqual([]);
  });

  it('requires evidence when someone else is posted', () => {
    expect(codes({ hasEvidence: false })).toEqual(['CONSENT_EVIDENCE_REQUIRED']);
    expect(codes({ method: 'SELF', hasEvidence: false })).toEqual([
      'CONSENT_METHOD',
      'CONSENT_EVIDENCE_REQUIRED',
    ]);
  });

  it('protects minors: guardian consent, no passers-by, and marked photos', () => {
    expect(codes({ beneficiaryIsMinor: true, method: 'GUARDIAN', anyMediaShowsMinor: true })).toEqual([]);
    expect(codes({ beneficiaryIsMinor: true, relationship: 'PASSERBY' })).toEqual([
      'GUARDIAN_REQUIRED',
      'MINOR_PASSERBY',
      'MINOR_MEDIA_UNMARKED',
    ]);
    expect(codes({ relationship: 'SELF', method: 'SELF', beneficiaryIsMinor: true })).toEqual(['SELF_MINOR']);
  });
});

describe('slugs', () => {
  it('turn Filipino titles into ASCII slugs', () => {
    expect(slugify('Gamot ni Lolo Ben, sa Parañaque!')).toBe('gamot-ni-lolo-ben-sa-paranaque');
    expect(slugify('!!!')).toBe('');
  });

  it('cut long titles at a word boundary', () => {
    const slug = slugify(
      'Tulong para sa pagpapagamot ni Nanay Rosa matapos ang malakas na baha sa Marikina City',
    );
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('get a random suffix so two posts never collide', () => {
    const first = newCampaignSlug('Gamot ni Lolo Ben');
    expect(first).toMatch(/^gamot-ni-lolo-ben-[a-z0-9]{6}$/);
    expect(newCampaignSlug('Gamot ni Lolo Ben')).not.toBe(first);
    expect(newCampaignSlug('!!!')).toMatch(/^tulong-[a-z0-9]{6}$/);
  });
});

describe('excessFundsPolicyText', () => {
  it('states the goal and where extra money goes for FIXED campaigns', () => {
    expect(excessFundsPolicyText('FIXED', 'Lolo Ben', 4_620_000n)).toContain('Kapag naabot na ang ₱46,200');
  });

  it('says there is no goal for OPEN_ENDED campaigns', () => {
    expect(excessFundsPolicyText('OPEN_ENDED', 'Nanay Rosa', null)).toContain('Walang takdang halaga');
  });

  it('renders the same policy in English', () => {
    expect(excessFundsPolicyText('FIXED', 'Lolo Ben', 4_620_000n, 'en')).toBe(
      'Donations close once ₱46,200 is reached. If donations arriving at the same time go over the goal, the extra still goes to the same need of Lolo Ben, with receipts.',
    );
    expect(excessFundsPolicyText('OPEN_ENDED', 'Nanay Rosa', null, 'en')).toContain('no set goal');
  });
});

describe('captionSummary', () => {
  it('uses the first paragraph, cut at a word', () => {
    const caption = `${'Si Lolo Ben ay nagtitinda ng taho sa Quezon City. '.repeat(5)}\n\nIkalawang talata.`;
    const summary = captionSummary(caption, 80);
    expect(summary.length).toBeLessThanOrEqual(80);
    expect(summary.endsWith('…')).toBe(true);
    expect(summary).not.toContain('Ikalawang');
  });

  it('keeps short captions whole', () => {
    expect(captionSummary('Maikling kuwento.')).toBe('Maikling kuwento.');
  });
});
