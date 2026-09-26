// apps/api/src/campaigns/campaign-copy.spec.ts
import { campaignTimeline, verificationChecks, type TimelineFacts } from './campaign-copy.js';

const facts: TimelineFacts = {
  slug: 'gamot-ni-lolo-ben-k3x9qa',
  creatorName: 'Ana R.',
  beneficiaryAlias: 'Lolo Ben',
  creatorVerifiedAt: new Date('2026-03-02T03:00:00.000Z'),
  postedAt: new Date('2026-09-20T02:00:00.000Z'),
  publishedAt: new Date('2026-09-21T00:00:00.000Z'),
  coordinatorVisitAt: null,
  firstDonationAt: new Date('2026-09-21T05:00:00.000Z'),
  donorCount: 214,
  disbursedMinor: 1_800_000n,
  lastDisbursedAt: new Date('2026-09-24T05:15:00.000Z'),
  receiptedMinor: 0n,
  receiptCount: 0,
  lastReceiptAt: null,
};

describe('campaignTimeline', () => {
  it('shows missing receipts as the current step, with the unreceipted amount', () => {
    const steps = campaignTimeline(facts);
    expect(steps.map((step) => [step.kind, step.state])).toEqual([
      ['CREATOR_VERIFIED', 'DONE'],
      ['POSTED', 'DONE'],
      ['REVIEWED', 'DONE'],
      ['MILESTONE_FUNDED', 'DONE'],
      ['DISBURSED', 'DONE'],
      ['PROOF', 'CURRENT'],
    ]);
    expect(steps.at(-1)?.detail).toBe('₱18,000 pa sa nailabas na pondo ang wala pang resibo.');
    expect(new Set(steps.map((step) => step.id)).size).toBe(steps.length);
  });

  it('marks receipts done once they cover every peso paid out', () => {
    const steps = campaignTimeline({
      ...facts,
      receiptedMinor: 1_800_000n,
      receiptCount: 2,
      lastReceiptAt: new Date(),
    });
    expect(steps.at(-1)).toMatchObject({ kind: 'PROOF', state: 'DONE', title: '2 resibo ang nai-post' });
  });

  it('waits for the first donation on a new post', () => {
    const steps = campaignTimeline({ ...facts, donorCount: 0, firstDonationAt: null, disbursedMinor: 0n });
    expect(steps.find((step) => step.kind === 'MILESTONE_FUNDED')).toMatchObject({ state: 'CURRENT' });
    expect(steps.find((step) => step.kind === 'DISBURSED')).toMatchObject({ state: 'UPCOMING' });
  });
});

describe('verificationChecks', () => {
  it('states only what was actually checked', () => {
    const checks = verificationChecks({
      creatorName: 'Ana R.',
      creatorVerifiedAt: new Date('2026-03-02T03:00:00.000Z'),
      relationshipSelf: false,
      consentMethod: 'SIGNED_FORM',
      publishedAt: new Date('2026-09-21T00:00:00.000Z'),
      coordinatorVisitAt: null,
      coordinatorName: null,
    });
    expect(checks[0]).toBe('Na-verify ang government ID at selfie ni Ana R. noong 2 Mar 2026.');
    expect(checks).toContain('May pirmadong pahintulot ang taong tinutulungan bago siya nai-post.');
    expect(checks.join(' ')).not.toContain('coordinator');
  });
});

describe('in English', () => {
  it('keeps the same steps and states, in plain English', () => {
    const filipino = campaignTimeline(facts);
    const english = campaignTimeline(facts, 'en');
    expect(english.map((step) => [step.id, step.kind, step.state])).toEqual(
      filipino.map((step) => [step.id, step.kind, step.state]),
    );
    expect(english.at(-1)).toMatchObject({
      title: 'Waiting for receipts',
      detail: '₱18,000 of the released funds has no receipt yet.',
    });
    expect(english.find((step) => step.kind === 'MILESTONE_FUNDED')?.detail).toMatch(
      /^214 donations received/,
    );
  });

  it('writes one receipt and one donation in the singular', () => {
    const steps = campaignTimeline(
      { ...facts, donorCount: 1, receiptedMinor: 1_800_000n, receiptCount: 1, lastReceiptAt: new Date() },
      'en',
    );
    expect(steps.at(-1)?.title).toBe('1 receipt posted');
    expect(steps.find((step) => step.kind === 'MILESTONE_FUNDED')?.detail).toMatch(/^1 donation received/);
  });

  it('states the checks with English dates', () => {
    const checks = verificationChecks(
      {
        creatorName: 'Ana R.',
        creatorVerifiedAt: new Date('2026-03-02T03:00:00.000Z'),
        relationshipSelf: false,
        consentMethod: 'VIDEO',
        publishedAt: null,
        coordinatorVisitAt: null,
        coordinatorName: null,
      },
      'en',
    );
    expect(checks).toEqual([
      "Ana R.'s government ID and selfie were verified on Mar 2, 2026.",
      'The person being helped gave recorded video consent before being posted.',
      'The creator posts a receipt for every expense, and receipts can never be edited or deleted.',
    ]);
  });
});
