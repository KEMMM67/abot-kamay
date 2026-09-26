// apps/api/src/campaigns/spending/spending-report-hash.spec.ts
import {
  computeSpendingReportHash,
  GENESIS_HASH,
  verifySpendingChain,
  type SpendingReportContent,
} from './spending-report-hash.js';

const receipt: SpendingReportContent = {
  campaignId: '0199837a-4c1e-7b2a-9d4e-6f1a2b3c4d01',
  authorId: '0199837a-4c1e-7b2a-9d4e-6f1a2b3c4d99',
  milestoneId: null,
  title: 'Gamot para sa isang buwan',
  note: null,
  amountMinor: 412_550n,
  currency: 'PHP',
  spentOn: '2026-09-24',
  merchantName: 'Botika ng Bayan',
  media: [
    { position: 2, kind: 'ITEM_PHOTO', sha256: 'b'.repeat(64) },
    { position: 1, kind: 'RECEIPT', sha256: 'a'.repeat(64) },
  ],
};

describe('spending report hash chain', () => {
  it('is deterministic and independent of media order in the input', () => {
    const hash = computeSpendingReportHash(receipt, GENESIS_HASH);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(computeSpendingReportHash({ ...receipt, media: [...receipt.media].reverse() }, GENESIS_HASH)).toBe(
      hash,
    );
  });

  it('changes when any fact, any receipt image, or the previous hash changes', () => {
    const hash = computeSpendingReportHash(receipt, GENESIS_HASH);
    expect(computeSpendingReportHash({ ...receipt, amountMinor: 412_551n }, GENESIS_HASH)).not.toBe(hash);
    expect(computeSpendingReportHash({ ...receipt, spentOn: '2026-09-23' }, GENESIS_HASH)).not.toBe(hash);
    expect(
      computeSpendingReportHash(
        { ...receipt, media: [{ position: 1, kind: 'RECEIPT', sha256: 'c'.repeat(64) }] },
        GENESIS_HASH,
      ),
    ).not.toBe(hash);
    expect(computeSpendingReportHash(receipt, 'd'.repeat(64))).not.toBe(hash);
  });

  it('verifies a chain and pinpoints a rewritten report', () => {
    const first = computeSpendingReportHash(receipt, GENESIS_HASH);
    const secondContent = { ...receipt, title: 'Bigas', amountMinor: 150_000n };
    const second = computeSpendingReportHash(secondContent, first);
    const chain = [
      { prevHash: GENESIS_HASH, hash: first, content: receipt },
      { prevHash: first, hash: second, content: secondContent },
    ];
    expect(verifySpendingChain(chain)).toEqual({ valid: true, length: 2 });

    const tampered = [chain[0]!, { ...chain[1]!, content: { ...secondContent, amountMinor: 1_500_000n } }];
    expect(verifySpendingChain(tampered)).toMatchObject({ valid: false, brokenAt: 1 });
    expect(verifySpendingChain([chain[1]!])).toMatchObject({ valid: false, brokenAt: 0 });
  });
});
