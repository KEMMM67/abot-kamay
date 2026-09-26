// apps/api/src/ledger/ledger-hash.ts
//
// Pure, dependency-free core of the AbotKamay public ledger. Anyone can re-implement these few
// functions from the public ledger export and independently verify every campaign's hash chain.
//
// hash(tx) = sha256( canonicalJson({ chainKey, type, referenceType, referenceId, occurredAt,
//                                    entries (sorted), prevHash }) )
import { createHash } from 'node:crypto';
import type { EntryDirection, LedgerTxnType } from '../generated/prisma/enums.js';

export const GENESIS_HASH = 'GENESIS';

export interface LedgerEntryInput {
  accountId: string;
  direction: EntryDirection;
  amountMinor: bigint;
  currency: string;
}

export interface LedgerTransactionContent {
  chainKey: string;
  type: LedgerTxnType;
  referenceType: string;
  referenceId: string;
  occurredAt: Date;
  entries: LedgerEntryInput[];
}

export class InvalidLedgerTransactionError extends Error {
  constructor(reason: string) {
    super(`Invalid ledger transaction: ${reason}`);
    this.name = 'InvalidLedgerTransactionError';
  }
}

/** Same rules as the database constraint trigger, enforced early with a readable error. */
export function assertBalanced(entries: readonly LedgerEntryInput[]): void {
  if (entries.length < 2) {
    throw new InvalidLedgerTransactionError('a transaction needs at least two entries');
  }
  const currencies = new Set(entries.map((entry) => entry.currency));
  if (currencies.size !== 1) {
    throw new InvalidLedgerTransactionError(`entries mix currencies (${[...currencies].join(', ')})`);
  }
  const [currency] = currencies;
  if (!currency || !/^[A-Z]{3}$/.test(currency)) {
    throw new InvalidLedgerTransactionError(`currency "${currency}" is not an ISO 4217 code`);
  }
  let net = 0n;
  for (const entry of entries) {
    if (entry.amountMinor <= 0n) {
      throw new InvalidLedgerTransactionError(
        'every entry amount must be positive; direction carries the sign',
      );
    }
    net += entry.direction === 'DEBIT' ? entry.amountMinor : -entry.amountMinor;
  }
  if (net !== 0n) {
    throw new InvalidLedgerTransactionError(`debits and credits differ by ${net} minor units`);
  }
}

/** JSON with recursively sorted object keys, so the same content always produces the same bytes. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function entrySortKey(entry: LedgerEntryInput): string {
  return `${entry.accountId}|${entry.direction}|${entry.currency}|${entry.amountMinor.toString().padStart(20, '0')}`;
}

export function canonicalTransactionPayload(content: LedgerTransactionContent, prevHash: string): string {
  return canonicalJson({
    chainKey: content.chainKey,
    type: content.type,
    referenceType: content.referenceType,
    referenceId: content.referenceId,
    occurredAt: content.occurredAt.toISOString(),
    entries: [...content.entries]
      .sort((a, b) => entrySortKey(a).localeCompare(entrySortKey(b)))
      .map((entry) => ({
        accountId: entry.accountId,
        direction: entry.direction,
        amountMinor: entry.amountMinor.toString(),
        currency: entry.currency,
      })),
    prevHash,
  });
}

export function computeTransactionHash(content: LedgerTransactionContent, prevHash: string): string {
  return createHash('sha256').update(canonicalTransactionPayload(content, prevHash), 'utf8').digest('hex');
}

export interface ChainLink {
  prevHash: string;
  hash: string;
  content: LedgerTransactionContent;
}

export type ChainVerification =
  { valid: true; length: number } | { valid: false; brokenAt: number; reason: string };

/** Recomputes every hash and link of a chain (ordered oldest first). */
export function verifyChain(links: readonly ChainLink[]): ChainVerification {
  let expectedPrev = GENESIS_HASH;
  for (const [index, link] of links.entries()) {
    if (link.prevHash !== expectedPrev) {
      return {
        valid: false,
        brokenAt: index,
        reason: 'prevHash does not match the previous transaction hash',
      };
    }
    const recomputed = computeTransactionHash(link.content, link.prevHash);
    if (recomputed !== link.hash) {
      return { valid: false, brokenAt: index, reason: 'stored hash does not match the transaction content' };
    }
    expectedPrev = link.hash;
  }
  return { valid: true, length: links.length };
}
