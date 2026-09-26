// apps/api/test/creator-guarantees.integration.spec.ts
//
// Proves the creator-model guarantees of migration 20260925000200 hold IN THE DATABASE, with
// application code bypassed: the KYC front gate on campaigns and creator payouts, funding type vs goal,
// immutable and unforkable spending reports, and the identity-check constraints.
// Every rejection is asserted on the specific PostgreSQL message or constraint, never "any error".
import { randomUUID } from 'node:crypto';
import { computeSpendingReportHash, GENESIS_HASH } from '../src/campaigns/spending/spending-report-hash.js';
import type { KycStatus } from '../src/generated/prisma/enums.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { expectDbRejection } from './support/db-error.js';
import { createTestPrisma, uniqueSlug } from './support/test-database.js';

let prisma: PrismaService;

beforeAll(async () => {
  prisma = createTestPrisma();
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createUser(kycStatus: KycStatus = 'VERIFIED', kycExpiresAt: Date | null = null) {
  return prisma.user.create({
    data: {
      email: `${uniqueSlug('creator')}@example.test`,
      kycStatus,
      kycVerifiedAt: kycStatus === 'VERIFIED' ? new Date() : null,
      kycExpiresAt,
    },
  });
}

async function createBeneficiary() {
  return prisma.beneficiary.create({
    data: {
      publicSlug: uniqueSlug('lola-cita'),
      publicAlias: 'Lola Cita',
      publicRegion: 'Iloilo City',
      needCategories: ['HOUSING'],
    },
  });
}

async function campaignData(creatorId: string, overrides: Record<string, unknown> = {}) {
  const beneficiary = await createBeneficiary();
  return {
    slug: uniqueSlug('post'),
    creatorId,
    creatorRelationship: 'FRIEND_OR_NEIGHBOR' as const,
    beneficiaryId: beneficiary.id,
    title: 'Bubong para kay Lola Cita',
    story: 'Test caption',
    fundingType: 'FIXED' as const,
    goalMinor: 4_200_000n,
    status: 'PENDING_REVIEW' as const,
    excessFundsPolicy: 'Test policy',
    ...overrides,
  };
}

async function createMedia(uploaderId: string, purpose: 'SPENDING_PROOF' | 'POST_MEDIA' = 'SPENDING_PROOF') {
  const id = randomUUID();
  return prisma.mediaAsset.create({
    data: {
      id,
      uploaderId,
      purpose,
      storageKey: `test/${id}.jpg`,
      mimeType: 'image/jpeg',
      byteSize: 1000,
      sha256: 'a'.repeat(64),
    },
  });
}

describe('KYC front gate on campaigns', () => {
  it('rejects a post by an unverified creator', async () => {
    const creator = await createUser('UNVERIFIED');
    await expectDbRejection(
      prisma.campaign.create({ data: await campaignData(creator.id) }),
      /creator .* is not KYC-verified \(kyc_status=UNVERIFIED/,
    );
  });

  it('rejects a post by a creator whose verification expired', async () => {
    const creator = await createUser('VERIFIED', new Date(Date.now() - 60_000));
    await expectDbRejection(
      prisma.campaign.create({ data: await campaignData(creator.id) }),
      /is not KYC-verified/,
    );
  });

  it('accepts a verified creator, and the creator can never be changed', async () => {
    const creator = await createUser('VERIFIED', new Date(Date.now() + 86_400_000));
    const other = await createUser('VERIFIED');
    const campaign = await prisma.campaign.create({ data: await campaignData(creator.id) });
    expect(campaign.creatorId).toBe(creator.id);
    await expectDbRejection(
      prisma.campaign.update({ where: { id: campaign.id }, data: { creatorId: other.id } }),
      /the creator of campaign .* cannot be changed/,
    );
  });

  it('refuses to publish a post whose creator was revoked while it waited for review', async () => {
    const creator = await createUser('VERIFIED');
    const campaign = await prisma.campaign.create({ data: await campaignData(creator.id) });
    await prisma.user.update({ where: { id: creator.id }, data: { kycStatus: 'REVOKED' } });
    await expectDbRejection(
      prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'ACTIVE' } }),
      /is not KYC-verified \(kyc_status=REVOKED/,
    );
    await expect(
      prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'CANCELLED' } }),
    ).resolves.toMatchObject({ status: 'CANCELLED' });
  });
});

describe('funding type and goal', () => {
  it('requires a positive goal for FIXED and no goal for OPEN_ENDED', async () => {
    const creator = await createUser();
    await expectDbRejection(
      prisma.campaign.create({ data: await campaignData(creator.id, { goalMinor: null }) }),
      /campaigns_goal_matches_funding_type/,
    );
    await expectDbRejection(
      prisma.campaign.create({ data: await campaignData(creator.id, { fundingType: 'OPEN_ENDED' }) }),
      /campaigns_goal_matches_funding_type/,
    );
    await expectDbRejection(
      prisma.campaign.create({ data: await campaignData(creator.id, { goalMinor: 0n }) }),
      /campaigns_goal_positive/,
    );
    await expect(
      prisma.campaign.create({
        data: await campaignData(creator.id, { fundingType: 'OPEN_ENDED', goalMinor: null }),
      }),
    ).resolves.toMatchObject({ fundingType: 'OPEN_ENDED', goalMinor: null });
  });
});

describe('creator payouts', () => {
  it('go only to the campaign creator while verified; cancelling still works after a revocation', async () => {
    const creator = await createUser();
    const stranger = await createUser();
    const campaign = await prisma.campaign.create({
      data: await campaignData(creator.id, { status: 'ACTIVE' }),
    });
    const milestone = await prisma.milestone.create({
      data: {
        campaignId: campaign.id,
        position: 1,
        title: 'Yero at kahoy',
        description: 'Materyales',
        budgetMinor: 2_600_000n,
        payoutMethod: 'CREATOR_PAYOUT',
      },
    });
    const base = {
      campaignId: campaign.id,
      milestoneId: milestone.id,
      method: 'CREATOR_PAYOUT' as const,
      payeeType: 'CREATOR',
      amountMinor: 2_600_000n,
      requestedById: randomUUID(),
    };

    await expectDbRejection(
      prisma.disbursement.create({
        data: { ...base, payeeId: stranger.id, idempotencyKey: uniqueSlug('p1') },
      }),
      /creator payouts can only go to the campaign's own creator/,
    );

    const payout = await prisma.disbursement.create({
      data: { ...base, payeeId: creator.id, idempotencyKey: uniqueSlug('p2') },
    });
    await prisma.user.update({ where: { id: creator.id }, data: { kycStatus: 'REVOKED' } });
    await expectDbRejection(
      prisma.disbursement.update({
        where: { id: payout.id },
        data: { status: 'APPROVED', approver1Id: randomUUID() },
      }),
      /payee .* is not KYC-verified \(kyc_status=REVOKED\)/,
    );
    await expect(
      prisma.disbursement.update({ where: { id: payout.id }, data: { status: 'CANCELED' } }),
    ).resolves.toMatchObject({ status: 'CANCELED' });
  });
});

describe('spending reports', () => {
  async function setup() {
    const creator = await createUser();
    const campaign = await prisma.campaign.create({
      data: await campaignData(creator.id, { status: 'ACTIVE' }),
    });
    return { creator, campaign };
  }

  function report(campaignId: string, authorId: string, prevHash: string, title = 'Gamot') {
    const content = {
      campaignId,
      authorId,
      milestoneId: null,
      title,
      note: null,
      amountMinor: 412_550n,
      currency: 'PHP',
      spentOn: '2026-09-24',
      merchantName: 'Botika',
      media: [],
    };
    return {
      campaignId,
      authorId,
      title,
      amountMinor: content.amountMinor,
      spentOn: new Date('2026-09-24T00:00:00.000Z'),
      merchantName: 'Botika',
      prevHash,
      hash: computeSpendingReportHash(content, prevHash),
    };
  }

  it('can only be written by the campaign creator', async () => {
    const { campaign } = await setup();
    const stranger = await createUser();
    await expectDbRejection(
      prisma.spendingReport.create({ data: report(campaign.id, stranger.id, GENESIS_HASH) }),
      /only the campaign's creator can post its spending reports/,
    );
  });

  it('keeps facts immutable, lets the review change, never deletes, and never forks', async () => {
    const { creator, campaign } = await setup();
    const first = await prisma.spendingReport.create({ data: report(campaign.id, creator.id, GENESIS_HASH) });

    await expectDbRejection(
      prisma.spendingReport.update({ where: { id: first.id }, data: { amountMinor: 1n } }),
      /the facts in spending report .* are immutable/,
    );
    await expect(
      prisma.spendingReport.update({
        where: { id: first.id },
        data: { status: 'VERIFIED', reviewedById: randomUUID(), reviewedAt: new Date(), reviewNote: null },
      }),
    ).resolves.toMatchObject({ status: 'VERIFIED' });
    await expectDbRejection(
      prisma.$executeRaw`DELETE FROM spending_reports WHERE id = ${first.id}::uuid`,
      /spending_reports is append-only \(DELETE rejected\)/,
    );
    await expectDbRejection(
      prisma.spendingReport.create({ data: report(campaign.id, creator.id, GENESIS_HASH, 'Fork') }),
      /spending_reports_campaign_id_prev_hash_key|Unique constraint failed/,
    );
    await expect(
      prisma.spendingReport.create({ data: report(campaign.id, creator.id, first.hash, 'Bigas') }),
    ).resolves.toMatchObject({ prevHash: first.hash });
  });

  it('never lets receipt images be swapped or removed', async () => {
    const { creator, campaign } = await setup();
    const saved = await prisma.spendingReport.create({ data: report(campaign.id, creator.id, GENESIS_HASH) });
    const media = await createMedia(creator.id);
    const replacement = await createMedia(creator.id);
    const link = await prisma.spendingReportMedia.create({
      data: { reportId: saved.id, mediaAssetId: media.id, kind: 'RECEIPT', position: 1 },
    });
    await expectDbRejection(
      prisma.spendingReportMedia.update({ where: { id: link.id }, data: { mediaAssetId: replacement.id } }),
      /spending_report_media is append-only \(UPDATE rejected\)/,
    );
    await expectDbRejection(
      prisma.$executeRaw`DELETE FROM spending_report_media WHERE id = ${link.id}::uuid`,
      /spending_report_media is append-only \(DELETE rejected\)/,
    );
  });
});

describe('identity checks', () => {
  function check(userId: string, overrides: Record<string, unknown> = {}) {
    return {
      userId,
      idType: 'PHILSYS' as const,
      displayName: 'Ana R.',
      challengeCode: 'AK-7Q4MXR',
      ...overrides,
    };
  }

  it('allows one check waiting for review per user', async () => {
    const applicant = await createUser('UNVERIFIED');
    await prisma.identityVerification.create({ data: check(applicant.id) });
    await expectDbRejection(
      prisma.identityVerification.create({ data: check(applicant.id) }),
      /identity_verifications_one_submitted_per_user|Unique constraint failed/,
    );
    await expect(
      prisma.identityVerification.create({ data: check(applicant.id, { status: 'WITHDRAWN' }) }),
    ).resolves.toMatchObject({ status: 'WITHDRAWN' });
  });

  it('never lets applicants review themselves, and records every decision', async () => {
    const applicant = await createUser('UNVERIFIED');
    await expectDbRejection(
      prisma.identityVerification.create({
        data: check(applicant.id, { status: 'APPROVED', reviewerId: applicant.id, decidedAt: new Date() }),
      }),
      /identity_verifications_reviewer_not_applicant/,
    );
    await expectDbRejection(
      prisma.identityVerification.create({
        data: check(applicant.id, { status: 'APPROVED', decidedAt: new Date() }),
      }),
      /identity_verifications_manual_approval_has_reviewer/,
    );
    await expectDbRejection(
      prisma.identityVerification.create({
        data: check(applicant.id, { status: 'REJECTED', reviewerId: randomUUID(), decidedAt: new Date() }),
      }),
      /identity_verifications_rejection_has_reason/,
    );
  });

  it('never marks a user VERIFIED without a verification time', async () => {
    await expectDbRejection(
      prisma.user.create({ data: { email: `${uniqueSlug('v')}@example.test`, kycStatus: 'VERIFIED' } }),
      /users_verified_has_timestamp/,
    );
  });
});
