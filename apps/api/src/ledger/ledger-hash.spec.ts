// apps/api/src/ledger/ledger-hash.spec.ts
import {
  assertBalanced,
  canonicalJson,
  computeTransactionHash,
  GENESIS_HASH,
  InvalidLedgerTransactionError,
  verifyChain,
  type LedgerEntryInput,
  type LedgerTransactionContent,
} from './ledger-hash.js';

const CLEARING = '0199a1b2-0000-7000-8000-000000000001';
const HELD = '0199a1b2-0000-7000-8000-000000000002';

function donation(amountMinor: bigint, referenceId = 'donation-1'): LedgerTransactionContent {
  return {
    chainKey: 'campaign-lolo-ben',
    type: 'DONATION_CAPTURED',
    referenceType: 'DONATION',
    referenceId,
    occurredAt: new Date('2026-09-25T08:00:00.000Z'),
    entries: [
      { accountId: CLEARING, direction: 'DEBIT', amountMinor, currency: 'PHP' },
      { accountId: HELD, direction: 'CREDIT', amountMinor, currency: 'PHP' },
    ],
  };
}

describe('assertBalanced', () => {
  it('accepts a balanced single-currency transaction', () => {
    expect(() => assertBalanced(donation(50_000n).entries)).not.toThrow();
  });

  it.each<[string, LedgerEntryInput[]]>([
    [
      'unbalanced',
      [
        { accountId: CLEARING, direction: 'DEBIT', amountMinor: 50_000n, currency: 'PHP' },
        { accountId: HELD, direction: 'CREDIT', amountMinor: 49_999n, currency: 'PHP' },
      ],
    ],
    ['single entry', [{ accountId: CLEARING, direction: 'DEBIT', amountMinor: 1n, currency: 'PHP' }]],
    [
      'mixed currencies',
      [
        { accountId: CLEARING, direction: 'DEBIT', amountMinor: 100n, currency: 'PHP' },
        { accountId: HELD, direction: 'CREDIT', amountMinor: 100n, currency: 'USD' },
      ],
    ],
    [
      'non-positive amount',
      [
        { accountId: CLEARING, direction: 'DEBIT', amountMinor: 0n, currency: 'PHP' },
        { accountId: HELD, direction: 'CREDIT', amountMinor: 0n, currency: 'PHP' },
      ],
    ],
    [
      'invalid currency code',
      [
        { accountId: CLEARING, direction: 'DEBIT', amountMinor: 100n, currency: 'php' },
        { accountId: HELD, direction: 'CREDIT', amountMinor: 100n, currency: 'php' },
      ],
    ],
  ])('rejects %s', (_label, entries) => {
    expect(() => assertBalanced(entries)).toThrow(InvalidLedgerTransactionError);
  });
});

describe('canonicalJson', () => {
  it('is independent of key insertion order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe(
      canonicalJson({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 }),
    );
  });
});

describe('computeTransactionHash', () => {
  it('is deterministic and independent of entry order', () => {
    const content = donation(50_000n);
    const reversed = { ...content, entries: [...content.entries].reverse() };
    const hash = computeTransactionHash(content, GENESIS_HASH);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(computeTransactionHash(reversed, GENESIS_HASH)).toBe(hash);
  });

  it('changes when the amount or the previous hash changes', () => {
    const base = computeTransactionHash(donation(50_000n), GENESIS_HASH);
    expect(computeTransactionHash(donation(50_001n), GENESIS_HASH)).not.toBe(base);
    expect(computeTransactionHash(donation(50_000n), 'a'.repeat(64))).not.toBe(base);
  });
});

describe('verifyChain', () => {
  function buildChain() {
    const first = donation(50_000n, 'donation-1');
    const firstHash = computeTransactionHash(first, GENESIS_HASH);
    const second = donation(25_000n, 'donation-2');
    const secondHash = computeTransactionHash(second, firstHash);
    return [
      { prevHash: GENESIS_HASH, hash: firstHash, content: first },
      { prevHash: firstHash, hash: secondHash, content: second },
    ];
  }

  it('accepts an intact chain', () => {
    expect(verifyChain(buildChain())).toEqual({ valid: true, length: 2 });
  });

  it('detects a tampered amount', () => {
    const chain = buildChain();
    const [first, second] = chain;
    const tamperedEntries = first!.content.entries.map((entry) => ({ ...entry, amountMinor: 5_000_000n }));
    const tampered = [{ ...first!, content: { ...first!.content, entries: tamperedEntries } }, second!];
    expect(verifyChain(tampered)).toMatchObject({ valid: false, brokenAt: 0 });
  });

  it('detects a removed transaction', () => {
    const [, second] = buildChain();
    expect(verifyChain([second!])).toMatchObject({ valid: false, brokenAt: 0 });
  });
});
