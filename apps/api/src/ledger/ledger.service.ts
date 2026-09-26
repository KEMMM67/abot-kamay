// apps/api/src/ledger/ledger.service.ts
//
// Appends balanced, hash-chained transactions to the AbotKamay public ledger.
//
// Concurrency and idempotency, in order:
//   1. pg_advisory_xact_lock(chainKey) serializes appends to one chain (in production, SQS FIFO
//      with MessageGroupId = campaignId already orders them; the lock is the safety net).
//   2. The idempotency key is checked AFTER taking the lock, so a redelivered message returns the
//      original transaction instead of posting twice.
//   3. The database backs all of this up: UNIQUE(idempotency_key), UNIQUE(chain_key, prev_hash)
//      (no forks), the deferred balance trigger, and append-only triggers.
import { Injectable } from '@nestjs/common';
import type { LedgerTransaction } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  assertBalanced,
  computeTransactionHash,
  GENESIS_HASH,
  verifyChain,
  type ChainVerification,
  type LedgerTransactionContent,
} from './ledger-hash.js';

export interface PostLedgerTransactionInput extends LedgerTransactionContent {
  idempotencyKey: string;
  description: string;
}

export interface PostLedgerTransactionResult {
  transaction: LedgerTransaction;
  /** false when the idempotency key had already been posted (safe replay). */
  created: boolean;
}

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async postTransaction(input: PostLedgerTransactionInput): Promise<PostLedgerTransactionResult> {
    assertBalanced(input.entries);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.chainKey}, 0))`;

      const existing = await tx.ledgerTransaction.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        return { transaction: existing, created: false };
      }

      const head = await tx.ledgerTransaction.findFirst({
        where: { chainKey: input.chainKey },
        orderBy: { seq: 'desc' },
        select: { hash: true },
      });
      const prevHash = head?.hash ?? GENESIS_HASH;

      const transaction = await tx.ledgerTransaction.create({
        data: {
          type: input.type,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          idempotencyKey: input.idempotencyKey,
          description: input.description,
          occurredAt: input.occurredAt,
          chainKey: input.chainKey,
          prevHash,
          hash: computeTransactionHash(input, prevHash),
          entries: {
            create: input.entries.map((entry) => ({
              accountId: entry.accountId,
              direction: entry.direction,
              amountMinor: entry.amountMinor,
              currency: entry.currency,
            })),
          },
        },
      });
      return { transaction, created: true };
    });
  }

  /** Recomputes the full hash chain from stored rows (used by the public "verify" endpoint and audits). */
  async verifyChain(chainKey: string): Promise<ChainVerification> {
    const transactions = await this.prisma.ledgerTransaction.findMany({
      where: { chainKey },
      orderBy: { seq: 'asc' },
      include: { entries: true },
    });
    return verifyChain(
      transactions.map((transaction) => ({
        prevHash: transaction.prevHash,
        hash: transaction.hash,
        content: {
          chainKey: transaction.chainKey,
          type: transaction.type,
          referenceType: transaction.referenceType,
          referenceId: transaction.referenceId,
          occurredAt: transaction.occurredAt,
          entries: transaction.entries.map((entry) => ({
            accountId: entry.accountId,
            direction: entry.direction,
            amountMinor: entry.amountMinor,
            currency: entry.currency,
          })),
        },
      })),
    );
  }

  /** Signed balance of one account: debits minus credits, in minor units. */
  async accountBalance(accountId: string): Promise<bigint> {
    const sums = await this.prisma.ledgerEntry.groupBy({
      by: ['direction'],
      where: { accountId },
      _sum: { amountMinor: true },
    });
    let balance = 0n;
    for (const row of sums) {
      const amount = row._sum.amountMinor ?? 0n;
      balance += row.direction === 'DEBIT' ? amount : -amount;
    }
    return balance;
  }
}
