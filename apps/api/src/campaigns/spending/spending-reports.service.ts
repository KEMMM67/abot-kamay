// apps/api/src/campaigns/spending/spending-reports.service.ts
//
// Creator-led transparency: the creator posts what was bought or paid, how much, when, and the
// receipts and photos, onto the campaign's public record.
//
//   POST /campaigns/:slug/spending-reports      the campaign's creator only
//   POST /review/spending-reports/:id/decision  trust and safety: VERIFY (receipts go public) or REJECT
//
// Each report extends the campaign's report hash chain. Appends are serialized per campaign with an
// advisory lock, and UNIQUE(campaign_id, prev_hash) makes a fork impossible even without it. The
// database also rejects edits to a report's facts, deletions, and reports by anyone but the creator.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isDbRefusal, isUniqueViolation } from '../../common/db/db-errors.js';
import { decodeTimeCursor, encodeTimeCursor, type Page } from '../../common/http/cursor.js';
import { manilaToday } from '../../common/format/fil.js';
import type { RequestMeta } from '../../common/http/request-meta.js';
import { uuidv7 } from '../../common/ids/uuidv7.js';
import type { User } from '../../generated/prisma/client.js';
import type { CampaignStatus, SpendingProofKind } from '../../generated/prisma/enums.js';
import { MediaService } from '../../media/media.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MAX_GOAL_MINOR } from '../campaign-policy.js';
import type { SpendingReportDto } from '../campaign.dto.js';
import { CampaignReadsService } from '../campaign-reads.service.js';
import { computeSpendingReportHash, GENESIS_HASH } from './spending-report-hash.js';

const DAY_MS = 86_400_000;
/** Receipts may predate the post a little: a bill paid while the post was being prepared. */
const MAX_DAYS_BEFORE_POST = 30;
/** Campaigns that can take receipts. Accountability continues after a campaign closes or is frozen. */
const REPORTABLE: readonly CampaignStatus[] = ['ACTIVE', 'PAUSED', 'FUNDED', 'UNDER_INVESTIGATION', 'CLOSED'];

export interface CreateSpendingReportInput {
  title: string;
  note?: string | undefined;
  amountMinor: bigint;
  spentOn: string; // YYYY-MM-DD
  merchantName?: string | undefined;
  milestoneId?: string | undefined;
  media: Array<{ mediaId: string; kind: SpendingProofKind }>;
}

export interface ReviewQueueReport {
  id: string;
  campaignSlug: string;
  campaignTitle: string;
  title: string;
  amountMinor: string;
  spentOn: string;
  merchantName: string | null;
  submittedAt: string;
  media: Array<{ kind: SpendingProofKind; viewUrl: string }>;
}

@Injectable()
export class SpendingReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly reads: CampaignReadsService,
  ) {}

  async create(
    author: User,
    slug: string,
    input: CreateSpendingReportInput,
    meta: RequestMeta,
  ): Promise<SpendingReportDto> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { slug },
      select: { id: true, creatorId: true, status: true, createdAt: true },
    });
    if (!campaign) throw new NotFoundException({ message: 'Campaign not found', code: 'NOT_FOUND' });
    if (campaign.creatorId !== author.id) {
      throw new ForbiddenException({
        message: "Only the campaign's creator can post its receipts",
        code: 'NOT_CREATOR',
      });
    }
    if (!REPORTABLE.includes(campaign.status)) {
      throw new ConflictException({
        message: 'This campaign cannot take receipts yet',
        code: 'CAMPAIGN_NOT_OPEN',
      });
    }

    const issues: Array<{ path: string; message: string }> = [];
    if (input.amountMinor <= 0n || input.amountMinor > MAX_GOAL_MINOR) {
      issues.push({ path: 'amountMinor', message: 'Amount is out of range' });
    }
    const earliest = new Date(campaign.createdAt.getTime() - MAX_DAYS_BEFORE_POST * DAY_MS)
      .toISOString()
      .slice(0, 10);
    if (input.spentOn > manilaToday() || input.spentOn < earliest) {
      issues.push({ path: 'spentOn', message: 'Use the date on the receipt' });
    }
    if (input.milestoneId) {
      const milestone = await this.prisma.milestone.findFirst({
        where: { id: input.milestoneId, campaignId: campaign.id },
        select: { id: true },
      });
      if (!milestone) issues.push({ path: 'milestoneId', message: 'Not part of this campaign' });
    }
    if (issues.length > 0)
      throw new BadRequestException({ message: 'Validation failed', code: 'REPORT_INVALID', issues });

    const assets = await this.media.claim(
      author.id,
      input.media.map((item) => item.mediaId),
      'SPENDING_PROOF',
    );

    const reportId = uuidv7();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spending:${campaign.id}`}, 0))`;
        const head = await tx.spendingReport.findFirst({
          where: { campaignId: campaign.id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { hash: true },
        });
        const prevHash = head?.hash ?? GENESIS_HASH;
        const media = input.media.map((item, index) => ({
          position: index + 1,
          kind: item.kind,
          sha256: assets[index]?.sha256 ?? '',
          mediaAssetId: item.mediaId,
        }));
        const content = {
          campaignId: campaign.id,
          authorId: author.id,
          milestoneId: input.milestoneId ?? null,
          title: input.title,
          note: input.note ?? null,
          amountMinor: input.amountMinor,
          currency: 'PHP',
          spentOn: input.spentOn,
          merchantName: input.merchantName ?? null,
          media,
        };

        await tx.spendingReport.create({
          data: {
            id: reportId,
            campaignId: campaign.id,
            milestoneId: content.milestoneId,
            authorId: author.id,
            title: content.title,
            note: content.note,
            amountMinor: content.amountMinor,
            currency: content.currency,
            spentOn: new Date(`${input.spentOn}T00:00:00.000Z`),
            merchantName: content.merchantName,
            prevHash,
            hash: computeSpendingReportHash(content, prevHash),
            media: {
              create: media.map((item) => ({
                mediaAssetId: item.mediaAssetId,
                kind: item.kind,
                position: item.position,
              })),
            },
          },
        });
        await tx.auditLog.create({
          data: {
            actorType: 'USER',
            actorId: author.id,
            action: 'SPENDING_REPORTED',
            entityType: 'spending_report',
            entityId: reportId,
            after: {
              campaignId: campaign.id,
              amountMinor: input.amountMinor.toString(),
              media: media.length,
            },
            requestId: meta.requestId,
            ip: meta.ip,
            userAgent: meta.userAgent,
          },
        });
        // Receipt OCR and amount matching (AI RECEIPT_CHECK), then human review.
        await tx.outboxEvent.create({
          data: {
            aggregateType: 'spending_report',
            aggregateId: reportId,
            eventType: 'spending_report.submitted',
            payload: { reportId, campaignId: campaign.id },
            messageGroup: campaign.id,
          },
        });
      });
    } catch (error) {
      if (isDbRefusal(error, /only the campaign's creator/)) {
        throw new ForbiddenException({
          message: "Only the campaign's creator can post its receipts",
          code: 'NOT_CREATOR',
        });
      }
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          message: 'These receipts were already posted',
          code: 'MEDIA_ALREADY_USED',
        });
      }
      throw error;
    }
    return this.reads.spendingReport(reportId);
  }

  // ------------------------------------------------------------------------------------ Review

  async queue(cursor: string | undefined, limit: number): Promise<Page<ReviewQueueReport>> {
    const after = cursor ? decodeTimeCursor(cursor) : null;
    const rows = await this.prisma.spendingReport.findMany({
      where: {
        status: { in: ['SUBMITTED', 'AI_CHECKED'] },
        ...(after
          ? { OR: [{ createdAt: { gt: after.at } }, { createdAt: after.at, id: { gt: after.id } }] }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      include: {
        campaign: { select: { slug: true, title: true } },
        media: { orderBy: { position: 'asc' }, include: { mediaAsset: true } },
      },
    });
    const page = rows.slice(0, limit);
    const items = await Promise.all(
      page.map(async (row) => ({
        id: row.id,
        campaignSlug: row.campaign.slug,
        campaignTitle: row.campaign.title,
        title: row.title,
        amountMinor: row.amountMinor.toString(),
        spentOn: row.spentOn.toISOString().slice(0, 10),
        merchantName: row.merchantName,
        submittedAt: row.createdAt.toISOString(),
        media: await Promise.all(
          row.media.map(async (item) => ({
            kind: item.kind,
            viewUrl: await this.media.viewRestricted(item.mediaAsset),
          })),
        ),
      })),
    );
    const last = page.at(-1);
    return {
      items,
      nextCursor: rows.length > limit && last ? encodeTimeCursor(last.createdAt, last.id) : null,
    };
  }

  async decide(
    reviewer: User,
    id: string,
    input: { decision: 'VERIFY' | 'REJECT'; note?: string | undefined },
    meta: RequestMeta,
  ): Promise<SpendingReportDto> {
    await this.prisma.$transaction(async (tx) => {
      const report = await tx.spendingReport.findUnique({ where: { id }, include: { media: true } });
      if (!report) throw new NotFoundException({ message: 'Report not found', code: 'NOT_FOUND' });
      if (report.authorId === reviewer.id) {
        throw new ForbiddenException({ message: 'You cannot review your own report', code: 'FOUR_EYES' });
      }
      if (input.decision === 'REJECT' && !input.note) {
        throw new BadRequestException({
          message: 'Say publicly why the report was rejected',
          code: 'NOTE_REQUIRED',
        });
      }
      const decided = await tx.spendingReport.updateMany({
        where: { id, status: { in: ['SUBMITTED', 'AI_CHECKED'] } },
        data: {
          status: input.decision === 'VERIFY' ? 'VERIFIED' : 'REJECTED',
          reviewedById: reviewer.id,
          reviewedAt: new Date(),
          reviewNote: input.note ?? null,
        },
      });
      if (decided.count !== 1) {
        throw new ConflictException({ message: 'This report was already reviewed', code: 'ALREADY_DECIDED' });
      }
      const mediaIds = report.media.map((item) => item.mediaAssetId);
      await tx.mediaAsset.updateMany({
        where: { id: { in: mediaIds } },
        data:
          input.decision === 'VERIFY'
            ? { moderation: 'APPROVED', visibility: 'PUBLIC' }
            : { moderation: 'REJECTED' },
      });
      if (input.decision === 'VERIFY') {
        await tx.outboxEvent.createMany({
          data: mediaIds.map((mediaId) => ({
            aggregateType: 'media_asset',
            aggregateId: mediaId,
            eventType: 'media.promote.requested',
            payload: { mediaId },
          })),
        });
      }
      await tx.auditLog.create({
        data: {
          actorType: 'USER',
          actorId: reviewer.id,
          action: input.decision === 'VERIFY' ? 'SPENDING_VERIFIED' : 'SPENDING_REJECTED',
          entityType: 'spending_report',
          entityId: id,
          before: { status: report.status },
          after: { status: input.decision === 'VERIFY' ? 'VERIFIED' : 'REJECTED', note: input.note ?? null },
          requestId: meta.requestId,
          ip: meta.ip,
          userAgent: meta.userAgent,
        },
      });
    });
    return this.reads.spendingReport(id);
  }
}
