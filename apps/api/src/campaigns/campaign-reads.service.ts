// apps/api/src/campaigns/campaign-reads.service.ts
//
// Public reads for the feed and campaign pages (cached by the web app for 30 seconds, and by the CDN):
//   GET /campaigns                         newest published first, cursor pagination
//   GET /campaigns/:slug                   post, creator badge, plan, timeline, ledger, receipts
//   GET /campaigns/:slug/ledger            the campaign's hash chain, newest first
//   GET /campaigns/:slug/spending-reports  the creator's receipts, newest first
// Only PUBLIC_STATUSES are visible; posts waiting for review answer 404 like posts that don't exist.
// Media appears only after moderation (visibility PUBLIC, moderation APPROVED) and once the media
// worker has written its re-encoded, metadata-free public copy (exifStripped). Until then the post
// shows without it, never with a link to a file that isn't there.
import { BadRequestException, Injectable } from '@nestjs/common';
import {
  decodeCursor,
  decodeTimeCursor,
  encodeCursor,
  encodeTimeCursor,
  type Page,
} from '../common/http/cursor.js';
import { isUuid } from '../common/ids/uuidv7.js';
import { Prisma, type MediaAsset } from '../generated/prisma/client.js';
import type { CampaignStatus, SpendingProofKind } from '../generated/prisma/enums.js';
import { MediaService } from '../media/media.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { campaignTimeline, verificationChecks } from './campaign-copy.js';
import { captionSummary, excessFundsPolicyText, PUBLIC_STATUSES } from './campaign-policy.js';
import type {
  CampaignDetailDto,
  CampaignSummaryDto,
  ContentLang,
  LedgerSummaryDto,
  MyCampaignDto,
  PublicLedgerEntryDto,
  PublicMediaDto,
  SpendingReportDto,
} from './campaign.dto.js';

/** Photos and videos per post in the feed: enough for a swipeable carousel, light enough for 4G. */
export const FEED_MEDIA_LIMIT = 4;

const PUBLIC_MEDIA_WHERE = {
  mediaAsset: { visibility: 'PUBLIC', moderation: 'APPROVED', exifStripped: true },
} satisfies Prisma.CampaignMediaWhereInput;

const SUMMARY_INCLUDE = {
  beneficiary: true,
  creator: { select: { displayName: true, kycVerifiedAt: true, createdAt: true } },
  media: {
    where: PUBLIC_MEDIA_WHERE,
    orderBy: { position: 'asc' },
    take: FEED_MEDIA_LIMIT,
    include: { mediaAsset: true },
  },
  _count: {
    select: {
      media: { where: PUBLIC_MEDIA_WHERE },
      donations: { where: { status: 'SUCCEEDED' } },
      spendingReports: { where: { status: { not: 'REJECTED' } } },
    },
  },
} satisfies Prisma.CampaignInclude;

const DETAIL_INCLUDE = {
  ...SUMMARY_INCLUDE,
  beneficiary: {
    include: { consents: { where: { revokedAt: null }, orderBy: { capturedAt: 'desc' }, take: 1 } },
  },
  media: { where: PUBLIC_MEDIA_WHERE, orderBy: { position: 'asc' }, include: { mediaAsset: true } },
  milestones: {
    orderBy: { position: 'asc' },
    include: {
      disbursements: {
        where: { proofDueAt: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { proofDueAt: true },
      },
    },
  },
  coordinator: {
    include: {
      user: { select: { displayName: true, kycVerifiedAt: true } },
      organization: { select: { legalName: true } },
      _count: { select: { campaigns: { where: { status: 'CLOSED' } } } },
    },
  },
} satisfies Prisma.CampaignInclude;

const SPENDING_INCLUDE = {
  milestone: { select: { title: true } },
  media: { orderBy: { position: 'asc' }, include: { mediaAsset: true } },
} satisfies Prisma.SpendingReportInclude;

type SummaryRow = Prisma.CampaignGetPayload<{ include: typeof SUMMARY_INCLUDE }>;
type SpendingRow = Prisma.SpendingReportGetPayload<{ include: typeof SPENDING_INCLUDE }>;

const FALLBACK_CREATOR_NAME = 'Na-verify na creator';

export function isPublicStatus(status: CampaignStatus): boolean {
  return (PUBLIC_STATUSES as readonly CampaignStatus[]).includes(status);
}

/** "Maria Santos" -> "Maria S."; the ledger never shows full donor names. */
export function maskDonorName(name: string | null): string | null {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return null;
  const [first, ...rest] = parts;
  const last = rest.at(-1);
  return last ? `${first} ${last[0]?.toUpperCase()}.` : (first ?? null);
}

interface LedgerTotalsRow {
  type: string;
  direction: 'DEBIT' | 'CREDIT';
  total: string;
  first: Date;
  last: Date;
}

@Injectable()
export class CampaignReadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  // ------------------------------------------------------------------------------------ Feed

  async list(cursor: string | undefined, limit: number): Promise<Page<CampaignSummaryDto>> {
    const after = cursor ? decodeTimeCursor(cursor) : null;
    const rows = await this.prisma.campaign.findMany({
      where: {
        status: { in: [...PUBLIC_STATUSES] },
        publishedAt: { not: null },
        ...(after
          ? { OR: [{ publishedAt: { lt: after.at } }, { publishedAt: after.at, id: { lt: after.id } }] }
          : {}),
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: SUMMARY_INCLUDE,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => this.toSummary(row)),
      nextCursor:
        rows.length > limit && last?.publishedAt ? encodeTimeCursor(last.publishedAt, last.id) : null,
    };
  }

  // ---------------------------------------------------------------------------- Campaign page

  async get(slug: string, lang: ContentLang = 'fil'): Promise<CampaignDetailDto | null> {
    const row = await this.prisma.campaign.findUnique({ where: { slug }, include: DETAIL_INCLUDE });
    if (!row || !isPublicStatus(row.status)) return null;

    const [ledger, spending, reports, postsCount, recentLedger] = await Promise.all([
      this.ledgerFacts(row.id),
      this.prisma.spendingReport.aggregate({
        where: { campaignId: row.id, status: { not: 'REJECTED' } },
        _sum: { amountMinor: true },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      this.prisma.spendingReport.findMany({
        where: { campaignId: row.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 3,
        include: SPENDING_INCLUDE,
      }),
      this.prisma.campaign.count({
        where: { creatorId: row.creatorId, status: { in: [...PUBLIC_STATUSES] } },
      }),
      this.ledgerEntries(row.id, null, 4),
    ]);

    const summary = this.toSummary(row);
    const creatorName = summary.creator.displayName;
    const receiptedMinor = spending._sum.amountMinor ?? 0n;
    const coordinator = row.coordinator;
    const coordinatorName = coordinator?.user.displayName ?? null;
    const reportCount = await this.prisma.spendingReport.count({ where: { campaignId: row.id } });

    const ledgerSummary: LedgerSummaryDto = {
      receivedMinor: ledger.receivedMinor.toString(),
      disbursedMinor: ledger.disbursedMinor.toString(),
      heldMinor: ledger.heldMinor.toString(),
      receiptedMinor: receiptedMinor.toString(),
      entryCount: ledger.entryCount,
      headHash: ledger.headHash,
    };

    return {
      ...summary,
      story: row.story,
      // The stored Filipino text is what the creator posted with; English is the same policy, rendered.
      excessFundsPolicy:
        lang === 'en'
          ? excessFundsPolicyText(row.fundingType, row.beneficiary.publicAlias, row.goalMinor, 'en')
          : row.excessFundsPolicy,
      closesAt: row.closesAt?.toISOString() ?? null,
      creator: { ...summary.creator, postsCount, memberSince: row.creator.createdAt.toISOString() },
      coordinator: coordinator && {
        displayName: coordinatorName ?? 'AbotKamay coordinator',
        tier: coordinator.tier,
        organizationName: coordinator.organization?.legalName ?? null,
        identityVerifiedAt: coordinator.user.kycVerifiedAt?.toISOString() ?? null,
        closedCampaigns: coordinator._count.campaigns,
        proofComplianceRate: coordinator.proofComplianceRate?.toString() ?? null,
      },
      media: row.media.flatMap((item) => this.toPublicMedia(item.mediaAsset, item.altText)),
      verificationChecks: verificationChecks(
        {
          creatorName,
          creatorVerifiedAt: row.creator.kycVerifiedAt,
          relationshipSelf: row.creatorRelationship === 'SELF',
          consentMethod: row.beneficiary.consents[0]?.method ?? null,
          publishedAt: row.publishedAt,
          coordinatorVisitAt: coordinator ? row.verifiedAt : null,
          coordinatorName,
        },
        lang,
      ),
      milestones: row.milestones.map((milestone) => ({
        id: milestone.id,
        position: milestone.position,
        title: milestone.title,
        description: milestone.description,
        budgetMinor: milestone.budgetMinor?.toString() ?? null,
        payoutMethod: milestone.payoutMethod,
        status: milestone.status,
        proofDueAt: milestone.disbursements[0]?.proofDueAt?.toISOString() ?? null,
      })),
      timeline: campaignTimeline(
        {
          slug: row.slug,
          creatorName,
          beneficiaryAlias: row.beneficiary.publicAlias,
          creatorVerifiedAt: row.creator.kycVerifiedAt,
          postedAt: row.createdAt,
          publishedAt: row.publishedAt,
          coordinatorVisitAt: coordinator ? row.verifiedAt : null,
          firstDonationAt: ledger.firstDonationAt,
          donorCount: summary.donorCount,
          disbursedMinor: ledger.disbursedMinor,
          lastDisbursedAt: ledger.lastDisbursedAt,
          receiptedMinor,
          receiptCount: spending._count._all,
          lastReceiptAt: spending._max.createdAt,
        },
        lang,
      ),
      sourcePosts: [],
      ledger: ledgerSummary,
      recentLedger: recentLedger.items,
      spendingReports: reports.map((report) => this.toSpendingDto(report)),
      spendingReportCount: reportCount,
    };
  }

  // ----------------------------------------------------------------------------------- Ledger

  async ledger(
    slug: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<Page<PublicLedgerEntryDto> | null> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { slug },
      select: { id: true, status: true },
    });
    if (!campaign || !isPublicStatus(campaign.status)) return null;
    let beforeSeq: bigint | null = null;
    if (cursor) {
      const [seq = ''] = decodeCursor(cursor, 1);
      if (!/^\d{1,19}$/.test(seq))
        throw new BadRequestException({ message: 'Invalid cursor', code: 'INVALID_CURSOR' });
      beforeSeq = BigInt(seq);
    }
    return this.ledgerEntries(campaign.id, beforeSeq, limit);
  }

  private async ledgerEntries(
    campaignId: string,
    beforeSeq: bigint | null,
    limit: number,
  ): Promise<Page<PublicLedgerEntryDto>> {
    const rows = await this.prisma.ledgerTransaction.findMany({
      where: { chainKey: campaignId, ...(beforeSeq !== null ? { seq: { lt: beforeSeq } } : {}) },
      orderBy: { seq: 'desc' },
      take: limit + 1,
      include: { entries: { include: { account: { select: { campaignId: true } } } } },
    });
    const page = rows.slice(0, limit);

    const donationIds = page
      .filter((row) => row.referenceType === 'DONATION' && isUuid(row.referenceId))
      .map((row) => row.referenceId);
    const donations = donationIds.length
      ? await this.prisma.donation.findMany({
          where: { id: { in: donationIds } },
          select: { id: true, isAnonymous: true, displayName: true },
        })
      : [];
    const donorLabels = new Map(
      donations.map((donation) => [
        donation.id,
        donation.isAnonymous ? 'Anonymous' : maskDonorName(donation.displayName),
      ]),
    );

    const items = page.map((row): PublicLedgerEntryDto => {
      // Net effect on this campaign's accounts: credits bring money in, debits take it out.
      let net = 0n;
      for (const entry of row.entries) {
        if (entry.account.campaignId !== campaignId) continue;
        net += entry.direction === 'CREDIT' ? entry.amountMinor : -entry.amountMinor;
      }
      return {
        id: row.id,
        seq: row.seq.toString(),
        type: row.type,
        direction: net >= 0n ? 'IN' : 'OUT',
        amountMinor: (net >= 0n ? net : -net).toString(),
        currency: 'PHP',
        donorLabel: row.referenceType === 'DONATION' ? (donorLabels.get(row.referenceId) ?? null) : null,
        description: row.description,
        occurredAt: row.occurredAt.toISOString(),
        hash: row.hash,
        prevHash: row.prevHash,
      };
    });
    const last = page.at(-1);
    return { items, nextCursor: rows.length > limit && last ? encodeCursor([last.seq.toString()]) : null };
  }

  private async ledgerFacts(campaignId: string) {
    const [totals, entryCount, head] = await Promise.all([
      this.prisma.$queryRaw<LedgerTotalsRow[]>`
        SELECT t.type::text AS "type", e.direction::text AS "direction", SUM(e.amount_minor)::text AS "total",
               MIN(t.occurred_at) AS "first", MAX(t.occurred_at) AS "last"
          FROM ledger_entries e
          JOIN ledger_accounts a ON a.id = e.account_id
          JOIN ledger_transactions t ON t.id = e.transaction_id
         WHERE a.campaign_id = ${campaignId}::uuid
         GROUP BY t.type, e.direction`,
      this.prisma.ledgerTransaction.count({ where: { chainKey: campaignId } }),
      this.prisma.ledgerTransaction.findFirst({
        where: { chainKey: campaignId },
        orderBy: { seq: 'desc' },
        select: { hash: true },
      }),
    ]);

    let credits = 0n;
    let debits = 0n;
    let receivedMinor = 0n;
    let disbursedMinor = 0n;
    let firstDonationAt: Date | null = null;
    let lastDisbursedAt: Date | null = null;
    for (const row of totals) {
      const total = BigInt(row.total);
      if (row.direction === 'CREDIT') credits += total;
      else debits += total;
      if (row.type === 'DONATION_CAPTURED' && row.direction === 'CREDIT') {
        receivedMinor += total;
        firstDonationAt = row.first;
      }
      if (row.type === 'DISBURSEMENT' && row.direction === 'DEBIT') {
        disbursedMinor += total;
        lastDisbursedAt = row.last;
      }
    }
    return {
      receivedMinor,
      disbursedMinor,
      heldMinor: credits - debits,
      entryCount,
      headHash: head?.hash ?? 'GENESIS',
      firstDonationAt,
      lastDisbursedAt,
    };
  }

  // ------------------------------------------------------------------------- Spending reports

  async spendingReports(
    slug: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<Page<SpendingReportDto> | null> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { slug },
      select: { id: true, status: true },
    });
    if (!campaign || !isPublicStatus(campaign.status)) return null;
    const after = cursor ? decodeTimeCursor(cursor) : null;
    const rows = await this.prisma.spendingReport.findMany({
      where: {
        campaignId: campaign.id,
        ...(after
          ? { OR: [{ createdAt: { lt: after.at } }, { createdAt: after.at, id: { lt: after.id } }] }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: SPENDING_INCLUDE,
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => this.toSpendingDto(row)),
      nextCursor: rows.length > limit && last ? encodeTimeCursor(last.createdAt, last.id) : null,
    };
  }

  async spendingReport(id: string): Promise<SpendingReportDto> {
    const row = await this.prisma.spendingReport.findUniqueOrThrow({
      where: { id },
      include: SPENDING_INCLUDE,
    });
    return this.toSpendingDto(row);
  }

  // --------------------------------------------------------------------------- Creator's own

  async mine(userId: string): Promise<MyCampaignDto[]> {
    const rows = await this.prisma.campaign.findMany({
      where: { creatorId: userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
      include: { _count: { select: { spendingReports: { where: { status: { not: 'REJECTED' } } } } } },
    });
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      status: row.status,
      fundingType: row.fundingType,
      goalMinor: row.goalMinor?.toString() ?? null,
      raisedMinor: row.raisedMinor.toString(),
      reviewNote: row.reviewNote,
      createdAt: row.createdAt.toISOString(),
      publishedAt: row.publishedAt?.toISOString() ?? null,
      receiptCount: row._count.spendingReports,
      isPublic: isPublicStatus(row.status),
    }));
  }

  // --------------------------------------------------------------------------------- Mapping

  private toPublicMedia(asset: MediaAsset, altText: string | null): PublicMediaDto[] {
    const url = this.media.publicUrl(asset);
    if (!url) return [];
    return [
      {
        id: asset.id,
        kind: this.media.kindOf(asset),
        url,
        posterUrl: this.media.posterUrl(asset),
        altText,
        width: asset.width,
        height: asset.height,
        durationMs: asset.durationMs,
      },
    ];
  }

  private toSummary(row: SummaryRow): CampaignSummaryDto {
    const media = row.media.flatMap((item) => this.toPublicMedia(item.mediaAsset, item.altText));
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: captionSummary(row.story),
      status: row.status,
      currency: 'PHP',
      fundingType: row.fundingType,
      goalMinor: row.goalMinor?.toString() ?? null,
      raisedMinor: row.raisedMinor.toString(),
      donorCount: row._count.donations,
      beneficiary: {
        alias: row.beneficiary.publicAlias,
        ageBand: row.beneficiary.ageBand,
        region: row.beneficiary.publicRegion,
        needCategories: row.beneficiary.needCategories,
      },
      creator: {
        displayName: row.creator.displayName ?? FALLBACK_CREATOR_NAME,
        kycVerifiedAt: row.creator.kycVerifiedAt?.toISOString() ?? null,
        relationship: row.creatorRelationship,
      },
      cover: media[0] ?? null,
      media,
      mediaCount: row._count.media,
      receiptCount: row._count.spendingReports,
      publishedAt: row.publishedAt?.toISOString() ?? null,
    };
  }

  private toSpendingDto(row: SpendingRow): SpendingReportDto {
    return {
      id: row.id,
      title: row.title,
      note: row.note,
      amountMinor: row.amountMinor.toString(),
      currency: 'PHP',
      spentOn: row.spentOn.toISOString().slice(0, 10),
      merchantName: row.merchantName,
      milestoneTitle: row.milestone?.title ?? null,
      status: row.status,
      reviewNote: row.status === 'REJECTED' ? row.reviewNote : null,
      media: row.media.flatMap((item) =>
        this.toPublicMedia(item.mediaAsset, null).map((media) => ({
          ...media,
          proofKind: item.kind as SpendingProofKind,
        })),
      ),
      mediaCount: row.media.length,
      hash: row.hash,
      prevHash: row.prevHash,
      postedAt: row.createdAt.toISOString(),
    };
  }
}
