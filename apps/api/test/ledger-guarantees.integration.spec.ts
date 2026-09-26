// apps/api/test/ledger-guarantees.integration.spec.ts
//
// Proves that AbotKamay's money and trust guarantees hold IN THE DATABASE, even when application
// code is bypassed: append-only ledger, balanced double-entry at commit, no chain forks, one open
// campaign per beneficiary, maker-checker on disbursements, and four-eyes on verification.
// Every rejection is asserted on the specific PostgreSQL message/constraint, never "any error".
import { randomUUID } from 'node:crypto';
import { computeTransactionHash, GENESIS_HASH } from '../src/ledger/ledger-hash.js';
import { LedgerService } from '../src/ledger/ledger.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { expectDbRejection } from './support/db-error.js';
import { createTestPrisma, RUN_ID, uniqueSlug } from './support/test-database.js';

let prisma: PrismaService;
let ledger: LedgerService;
let clearingId: string;
let heldId: string;
const chainKey = `chain_${RUN_ID}`;

function donationInput(amountMinor: bigint, idempotencyKey: string) {
  return {
    chainKey,
    type: 'DONATION_CAPTURED' as const,
    referenceType: 'DONATION',
    referenceId: idempotencyKey,
    idempotencyKey,
    description: 'Integration test donation',
    occurredAt: new Date(),
    entries: [
      { accountId: clearingId, direction: 'DEBIT' as const, amountMinor, currency: 'PHP' },
      { accountId: heldId, direction: 'CREDIT' as const, amountMinor, currency: 'PHP' },
    ],
  };
}

beforeAll(async () => {
  prisma = createTestPrisma();
  await prisma.$connect();
  ledger = new LedgerService(prisma);
  const clearing = await prisma.ledgerAccount.create({
    data: { code: `test:${RUN_ID}:clearing`, type: 'ASSET', currency: 'PHP' },
  });
  const held = await prisma.ledgerAccount.create({
    data: { code: `test:${RUN_ID}:held`, type: 'LIABILITY', currency: 'PHP' },
  });
  clearingId = clearing.id;
  heldId = held.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('ledger posting', () => {
  it('posts balanced transactions as a verifiable hash chain and is idempotent', async () => {
    const first = await ledger.postTransaction(donationInput(50_000n, `don_${RUN_ID}_1`));
    const second = await ledger.postTransaction(donationInput(25_000n, `don_${RUN_ID}_2`));
    const replay = await ledger.postTransaction(donationInput(50_000n, `don_${RUN_ID}_1`));

    expect(first.created).toBe(true);
    expect(first.transaction.prevHash).toBe(GENESIS_HASH);
    expect(second.transaction.prevHash).toBe(first.transaction.hash);
    expect(replay).toMatchObject({ created: false, transaction: { id: first.transaction.id } });

    expect(await ledger.verifyChain(chainKey)).toEqual({ valid: true, length: 2 });
    expect(await ledger.accountBalance(clearingId)).toBe(75_000n);
    expect(await ledger.accountBalance(heldId)).toBe(-75_000n);
  });
});

describe('append-only ledger (application code bypassed)', () => {
  it('rejects UPDATE', async () => {
    await expectDbRejection(
      prisma.$executeRaw`UPDATE ledger_entries SET amount_minor = 1 WHERE account_id = ${clearingId}::uuid`,
      /ledger_entries is append-only \(UPDATE rejected\)/,
    );
  });

  it('rejects DELETE', async () => {
    await expectDbRejection(
      prisma.$executeRaw`DELETE FROM ledger_transactions WHERE chain_key = ${chainKey}`,
      /ledger_transactions is append-only \(DELETE rejected\)/,
    );
  });

  it('rejects TRUNCATE', async () => {
    await expectDbRejection(
      prisma.$executeRawUnsafe('TRUNCATE ledger_entries CASCADE'),
      /ledger_entries is append-only \(TRUNCATE rejected\)/,
    );
  });

  it('rejects a fork (a second transaction extending the same predecessor)', async () => {
    const head = await prisma.ledgerTransaction.findFirstOrThrow({
      where: { chainKey },
      orderBy: { seq: 'desc' },
    });
    await expectDbRejection(
      prisma.ledgerTransaction.create({
        data: {
          type: 'ADJUSTMENT',
          referenceType: 'TEST',
          referenceId: 'fork',
          idempotencyKey: `fork_${RUN_ID}`,
          description: 'fork attempt',
          occurredAt: new Date(),
          chainKey,
          prevHash: head.prevHash, // same predecessor as the current head
          hash: 'f'.repeat(64),
          entries: {
            create: [
              { accountId: clearingId, direction: 'DEBIT', amountMinor: 1n, currency: 'PHP' },
              { accountId: heldId, direction: 'CREDIT', amountMinor: 1n, currency: 'PHP' },
            ],
          },
        },
      }),
      /chain_key.*prev_hash|ledger_transactions_chain_key_prev_hash_key/s,
    );
  });
});

describe('trust workflow guarantees', () => {
  async function createCoordinatorAndBeneficiary() {
    // Campaigns need a KYC-verified creator (migration 20260925000200); here the coordinator posts it.
    const user = await prisma.user.create({
      data: {
        email: `${uniqueSlug('coord')}@example.test`,
        roles: ['COORDINATOR'],
        kycStatus: 'VERIFIED',
        kycVerifiedAt: new Date(),
      },
    });
    const coordinator = await prisma.coordinatorProfile.create({
      data: { userId: user.id, tier: 'TIER3_ORG_BACKED', languages: ['fil', 'ceb'] },
    });
    const beneficiary = await prisma.beneficiary.create({
      data: {
        publicSlug: uniqueSlug('lolo-ben'),
        publicAlias: 'Lolo Ben',
        publicRegion: 'Cebu City',
        needCategories: ['ELDERLY_WORKING'],
      },
    });
    return { user, coordinator, beneficiary };
  }

  function campaignData(
    creatorId: string,
    beneficiaryId: string,
    coordinatorId: string,
    status: 'ACTIVE' | 'CLOSED',
  ) {
    return {
      slug: uniqueSlug('campaign'),
      creatorId,
      creatorRelationship: 'COMMUNITY_WORKER' as const,
      beneficiaryId,
      coordinatorId,
      title: 'Help Lolo Ben rest',
      story: 'Test story',
      fundingType: 'FIXED' as const,
      goalMinor: 5_000_000n,
      status,
      excessFundsPolicy: 'Surplus goes to the beneficiary long-term support fund managed by the partner NGO.',
    };
  }

  it('allows only one open campaign per beneficiary (closed ones are kept as history)', async () => {
    const { user, coordinator, beneficiary } = await createCoordinatorAndBeneficiary();
    await prisma.campaign.create({ data: campaignData(user.id, beneficiary.id, coordinator.id, 'ACTIVE') });
    await expectDbRejection(
      prisma.campaign.create({ data: campaignData(user.id, beneficiary.id, coordinator.id, 'ACTIVE') }),
      /campaigns_one_open_per_beneficiary|Unique constraint failed/,
    );
    await expect(
      prisma.campaign.create({ data: campaignData(user.id, beneficiary.id, coordinator.id, 'CLOSED') }),
    ).resolves.toMatchObject({ status: 'CLOSED' });
  });

  it('enforces maker-checker on disbursements', async () => {
    const { user, coordinator, beneficiary } = await createCoordinatorAndBeneficiary();
    const campaign = await prisma.campaign.create({
      data: campaignData(user.id, beneficiary.id, coordinator.id, 'ACTIVE'),
    });
    const milestone = await prisma.milestone.create({
      data: {
        campaignId: campaign.id,
        position: 1,
        title: 'Wheelchair',
        description: 'Paid directly to the supplier',
        budgetMinor: 1_500_000n,
        payoutMethod: 'VENDOR_DIRECT',
      },
    });
    const base = {
      campaignId: campaign.id,
      milestoneId: milestone.id,
      method: 'VENDOR_DIRECT' as const,
      payeeType: 'VENDOR',
      payeeId: randomUUID(),
      amountMinor: 1_500_000n,
      requestedById: user.id,
    };

    await expectDbRejection(
      prisma.disbursement.create({
        data: { ...base, idempotencyKey: uniqueSlug('d1'), approver1Id: user.id },
      }),
      /disbursements_maker_checker/,
    );

    const approver = randomUUID();
    await expectDbRejection(
      prisma.disbursement.create({
        data: { ...base, idempotencyKey: uniqueSlug('d2'), approver1Id: approver, approver2Id: approver },
      }),
      /disbursements_maker_checker/,
    );

    await expect(
      prisma.disbursement.create({
        data: { ...base, idempotencyKey: uniqueSlug('d3'), approver1Id: approver, approver2Id: randomUUID() },
      }),
    ).resolves.toMatchObject({ status: 'REQUESTED' });
  });

  it('enforces four-eyes on verification decisions', async () => {
    const submitter = await prisma.user.create({ data: { email: `${uniqueSlug('sub')}@example.test` } });
    const post = await prisma.socialPost.create({
      data: {
        platform: 'TIKTOK',
        platformPostId: uniqueSlug('7412345678901234567'),
        canonicalUrl: 'https://www.tiktok.com/@creator/video/7412345678901234567',
      },
    });
    const submission = await prisma.submission.create({
      data: { trackingCode: uniqueSlug('AK'), submittedById: submitter.id, socialPostId: post.id },
    });
    const reviewer = randomUUID();
    await expectDbRejection(
      prisma.verificationCase.create({
        data: { submissionId: submission.id, firstReviewerId: reviewer, secondReviewerId: reviewer },
      }),
      /verification_cases_four_eyes/,
    );
  });
});

describe('balanced double-entry (application code bypassed)', () => {
  it('rejects an unbalanced transaction when it commits', async () => {
    const txId = randomUUID();
    const unbalancedChain = `unbalanced_${RUN_ID}`;
    const hash = computeTransactionHash(
      { ...donationInput(1n, 'x'), chainKey: unbalancedChain },
      GENESIS_HASH,
    );
    await expectDbRejection(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          INSERT INTO ledger_transactions (id, type, reference_type, reference_id, idempotency_key,
                                           description, occurred_at, chain_key, prev_hash, hash)
          VALUES (${txId}::uuid, 'ADJUSTMENT', 'TEST', 'unbalanced', ${unbalancedChain},
                  'should fail', now(), ${unbalancedChain}, 'GENESIS', ${hash})`;
        await tx.$executeRaw`
          INSERT INTO ledger_entries (id, transaction_id, account_id, direction, amount_minor, currency)
          VALUES (${randomUUID()}::uuid, ${txId}::uuid, ${clearingId}::uuid, 'DEBIT', 100, 'PHP')`;
      }),
      /ledger transaction .* is invalid \(imbalance=100, entries=1/,
    );
    expect(await prisma.ledgerTransaction.count({ where: { chainKey: unbalancedChain } })).toBe(0);
  });
});
