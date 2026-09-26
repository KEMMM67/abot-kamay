// apps/api/src/campaigns/campaign-moderation.service.ts
//
// Trust and safety review of new posts (REVIEWER role):
//   GET  /review/campaigns                 posts waiting for review, oldest first, with 5-minute media links
//   POST /review/campaigns/:id/decision    PUBLISH -> ACTIVE and in the feed | REJECT -> CANCELLED with a note
//
// Publishing re-checks the creator's KYC in the database (campaigns_creator_kyc_gate), so a creator
// revoked while their post waited cannot go live. Photos that show a minor need the reviewer's
// confirmation that the published copies are blurred.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isDbRefusal } from '../common/db/db-errors.js';
import { decodeTimeCursor, encodeTimeCursor, type Page } from '../common/http/cursor.js';
import type { RequestMeta } from '../common/http/request-meta.js';
import type { User } from '../generated/prisma/client.js';
import type { FundingType } from '../generated/prisma/enums.js';
import { MediaService } from '../media/media.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface PendingPost {
  id: string;
  slug: string;
  title: string;
  caption: string;
  fundingType: FundingType;
  goalMinor: string | null;
  creator: { id: string; displayName: string | null; kycVerifiedAt: string | null };
  beneficiary: { alias: string; region: string; ageBand: string | null };
  relationship: string;
  consent: { method: string; evidenceUrl: string | null } | null;
  media: Array<{
    id: string;
    kind: 'IMAGE' | 'VIDEO';
    viewUrl: string;
    showsMinor: boolean;
    altText: string | null;
  }>;
  submittedAt: string;
}

export type PostDecisionInput =
  | { decision: 'PUBLISH'; minorsBlurred?: boolean | undefined; note?: string | undefined }
  | { decision: 'REJECT'; note: string };

@Injectable()
export class CampaignModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  async queue(
    reviewer: User,
    cursor: string | undefined,
    limit: number,
    meta: RequestMeta,
  ): Promise<Page<PendingPost>> {
    const after = cursor ? decodeTimeCursor(cursor) : null;
    const rows = await this.prisma.campaign.findMany({
      where: {
        status: 'PENDING_REVIEW',
        ...(after
          ? { OR: [{ createdAt: { gt: after.at } }, { createdAt: after.at, id: { gt: after.id } }] }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      include: {
        creator: { select: { id: true, displayName: true, kycVerifiedAt: true } },
        beneficiary: { include: { consents: { orderBy: { capturedAt: 'desc' }, take: 1 } } },
        media: { orderBy: { position: 'asc' }, include: { mediaAsset: true } },
      },
    });
    const page = rows.slice(0, limit);

    const items = await Promise.all(
      page.map(async (row): Promise<PendingPost> => {
        const consent = row.beneficiary.consents[0];
        const evidence = consent?.evidenceMediaId
          ? await this.prisma.mediaAsset.findUnique({ where: { id: consent.evidenceMediaId } })
          : null;
        return {
          id: row.id,
          slug: row.slug,
          title: row.title,
          caption: row.story,
          fundingType: row.fundingType,
          goalMinor: row.goalMinor?.toString() ?? null,
          creator: {
            id: row.creator.id,
            displayName: row.creator.displayName,
            kycVerifiedAt: row.creator.kycVerifiedAt?.toISOString() ?? null,
          },
          beneficiary: {
            alias: row.beneficiary.publicAlias,
            region: row.beneficiary.publicRegion,
            ageBand: row.beneficiary.ageBand,
          },
          relationship: row.creatorRelationship,
          consent: consent
            ? {
                method: consent.method,
                evidenceUrl: evidence ? await this.media.viewRestricted(evidence) : null,
              }
            : null,
          media: await Promise.all(
            row.media.map(async (item) => ({
              id: item.mediaAsset.id,
              kind: this.media.kindOf(item.mediaAsset),
              viewUrl: await this.media.viewRestricted(item.mediaAsset),
              showsMinor: item.showsMinor,
              altText: item.altText,
            })),
          ),
          submittedAt: row.createdAt.toISOString(),
        };
      }),
    );

    if (page.length > 0) {
      await this.prisma.auditLog.createMany({
        data: page.map((row) => ({
          actorType: 'USER' as const,
          actorId: reviewer.id,
          action: 'EVIDENCE_VIEWED',
          entityType: 'campaign',
          entityId: row.id,
          after: { reason: 'POST_REVIEW' },
          requestId: meta.requestId,
          ip: meta.ip,
          userAgent: meta.userAgent,
        })),
      });
    }
    const last = page.at(-1);
    return {
      items,
      nextCursor: rows.length > limit && last ? encodeTimeCursor(last.createdAt, last.id) : null,
    };
  }

  async decide(
    reviewer: User,
    id: string,
    input: PostDecisionInput,
    meta: RequestMeta,
  ): Promise<{ id: string; slug: string; status: 'ACTIVE' | 'CANCELLED' }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const campaign = await tx.campaign.findUnique({
          where: { id },
          include: { media: { include: { mediaAsset: true } } },
        });
        if (!campaign) throw new NotFoundException({ message: 'Campaign not found', code: 'NOT_FOUND' });
        if (campaign.creatorId === reviewer.id) {
          throw new ForbiddenException({ message: 'You cannot review your own post', code: 'FOUR_EYES' });
        }
        if (campaign.status !== 'PENDING_REVIEW') {
          throw new ConflictException({ message: 'This post was already reviewed', code: 'ALREADY_DECIDED' });
        }
        const mediaIds = campaign.media.map((item) => item.mediaAssetId);
        const now = new Date();

        if (input.decision === 'PUBLISH') {
          if (campaign.media.some((item) => item.mediaAsset.malwareScan === 'INFECTED')) {
            throw new BadRequestException({
              message: 'A file failed the malware scan',
              code: 'MEDIA_INFECTED',
            });
          }
          if (campaign.media.some((item) => item.showsMinor) && !input.minorsBlurred) {
            throw new BadRequestException({
              message: "Confirm that children's faces are blurred in the published copies",
              code: 'MINORS_NOT_BLURRED',
            });
          }
          await tx.campaign.update({
            where: { id },
            data: {
              status: 'ACTIVE',
              publishedAt: now,
              reviewNote: input.note ?? null,
              version: { increment: 1 },
            },
          });
          await tx.mediaAsset.updateMany({
            where: { id: { in: mediaIds } },
            data: { moderation: 'APPROVED', visibility: 'PUBLIC' },
          });
          await tx.outboxEvent.createMany({
            data: [
              ...mediaIds.map((mediaId) => ({
                aggregateType: 'media_asset',
                aggregateId: mediaId,
                eventType: 'media.promote.requested',
                payload: {
                  mediaId,
                  blurMinors: campaign.media.some((item) => item.mediaAssetId === mediaId && item.showsMinor),
                },
              })),
              {
                aggregateType: 'campaign',
                aggregateId: id,
                eventType: 'campaign.published',
                payload: { campaignId: id, creatorId: campaign.creatorId },
                messageGroup: id,
              },
            ],
          });
        } else {
          await tx.campaign.update({
            where: { id },
            data: { status: 'CANCELLED', reviewNote: input.note, version: { increment: 1 } },
          });
          await tx.mediaAsset.updateMany({
            where: { id: { in: mediaIds } },
            data: { moderation: 'REJECTED' },
          });
          await tx.outboxEvent.create({
            data: {
              aggregateType: 'campaign',
              aggregateId: id,
              eventType: 'campaign.rejected',
              payload: { campaignId: id, creatorId: campaign.creatorId },
              messageGroup: id,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            actorType: 'USER',
            actorId: reviewer.id,
            action: input.decision === 'PUBLISH' ? 'CAMPAIGN_PUBLISHED' : 'CAMPAIGN_REJECTED',
            entityType: 'campaign',
            entityId: id,
            before: { status: campaign.status },
            after: {
              status: input.decision === 'PUBLISH' ? 'ACTIVE' : 'CANCELLED',
              note: input.note ?? null,
            },
            requestId: meta.requestId,
            ip: meta.ip,
            userAgent: meta.userAgent,
          },
        });
        return {
          id,
          slug: campaign.slug,
          status: input.decision === 'PUBLISH' ? ('ACTIVE' as const) : ('CANCELLED' as const),
        };
      });
    } catch (error) {
      if (isDbRefusal(error, /not KYC-verified/)) {
        throw new ConflictException({
          message: "The creator's ID verification is no longer valid; the post cannot be published",
          code: 'CREATOR_NOT_VERIFIED',
        });
      }
      throw error;
    }
  }
}
