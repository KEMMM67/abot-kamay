// apps/api/src/campaigns/campaign-posts.service.ts
//
// POST /campaigns: a KYC-verified creator posts photos/videos of a person in need with a caption,
// says how the money will be used, and attaches the person's consent. The post waits in
// PENDING_REVIEW until trust and safety publishes it (campaign-moderation.service.ts).
//
// Checks, in order: KycVerifiedGuard (route) -> open-campaign limit -> funding plan -> consent ->
// uploaded files -> one transaction. The database repeats the KYC check in a trigger, so a creator
// revoked a moment ago still cannot post.
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isDbRefusal, isUniqueViolation } from '../common/db/db-errors.js';
import type { RequestMeta } from '../common/http/request-meta.js';
import { uuidv7 } from '../common/ids/uuidv7.js';
import type { Env } from '../config/env.schema.js';
import type { User } from '../generated/prisma/client.js';
import type { CreatorRelationship, FundingType } from '../generated/prisma/enums.js';
import { MediaService } from '../media/media.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  checkConsent,
  checkFundingPlan,
  excessFundsPolicyText,
  newCampaignSlug,
  OPEN_STATUSES,
  type ConsentMethod,
  type NeedCategory,
  type PlanItemInput,
} from './campaign-policy.js';
import type { CreatedCampaignDto } from './campaign.dto.js';

export interface CreateCampaignInput {
  title: string;
  caption: string;
  fundingType: FundingType;
  plan: PlanItemInput[];
  relationship: CreatorRelationship;
  beneficiary: {
    alias: string;
    ageBand?: string | undefined;
    region: string;
    needCategories: NeedCategory[];
    isMinor: boolean;
  };
  media: Array<{ mediaId: string; altText?: string | undefined; showsMinor: boolean }>;
  consent: { method: ConsentMethod; evidenceMediaId?: string | undefined };
  closesAt?: Date | undefined;
}

@Injectable()
export class CampaignPostsService {
  private readonly maxOpenCampaigns: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    config: ConfigService<Env, true>,
  ) {
    this.maxOpenCampaigns = config.get('CREATOR_MAX_OPEN_CAMPAIGNS', { infer: true });
  }

  async create(creator: User, input: CreateCampaignInput, meta: RequestMeta): Promise<CreatedCampaignDto> {
    const open = await this.prisma.campaign.count({
      where: { creatorId: creator.id, status: { in: [...OPEN_STATUSES] } },
    });
    if (open >= this.maxOpenCampaigns) {
      throw new ConflictException({
        message: `You can have up to ${this.maxOpenCampaigns} open campaigns at a time`,
        code: 'CREATOR_LIMIT',
        limit: this.maxOpenCampaigns,
      });
    }

    const plan = checkFundingPlan(input.fundingType, input.plan);
    const consentIssues = checkConsent({
      relationship: input.relationship,
      beneficiaryIsMinor: input.beneficiary.isMinor,
      method: input.consent.method,
      hasEvidence: Boolean(input.consent.evidenceMediaId),
      anyMediaShowsMinor: input.media.some((item) => item.showsMinor),
    });
    const issues = [...(plan.ok ? [] : plan.issues), ...consentIssues];
    if (!plan.ok || issues.length > 0) {
      throw new BadRequestException({ message: 'Validation failed', code: 'POST_INVALID', issues });
    }

    await this.media.claim(
      creator.id,
      input.media.map((item) => item.mediaId),
      'POST_MEDIA',
    );
    const evidenceId = input.consent.method === 'SELF' ? null : (input.consent.evidenceMediaId ?? null);
    if (evidenceId) await this.media.claim(creator.id, [evidenceId], 'CONSENT_EVIDENCE');

    const campaignId = uuidv7();
    const slug = newCampaignSlug(input.title);
    const now = new Date();

    try {
      await this.prisma.$transaction(async (tx) => {
        const beneficiary = await tx.beneficiary.create({
          data: {
            publicSlug: slug,
            publicAlias: input.beneficiary.alias,
            ageBand: input.beneficiary.ageBand ?? null,
            publicRegion: input.beneficiary.region,
            needCategories: input.beneficiary.needCategories,
          },
        });
        await tx.consentRecord.create({
          data: {
            beneficiaryId: beneficiary.id,
            capturedByUserId: creator.id,
            method: input.consent.method,
            language: 'fil',
            scopes: ['PUBLIC_PHOTO', 'PUBLIC_STORY', 'FUNDRAISING'],
            evidenceMediaId: evidenceId,
            capturedAt: now,
          },
        });
        await tx.campaign.create({
          data: {
            id: campaignId,
            slug,
            creatorId: creator.id,
            creatorRelationship: input.relationship,
            beneficiaryId: beneficiary.id,
            title: input.title,
            story: input.caption,
            fundingType: input.fundingType,
            goalMinor: plan.goalMinor,
            status: 'PENDING_REVIEW',
            excessFundsPolicy: excessFundsPolicyText(
              input.fundingType,
              input.beneficiary.alias,
              plan.goalMinor,
            ),
            closesAt: input.closesAt ?? null,
            milestones: {
              create: input.plan.map((item, index) => ({
                position: index + 1,
                title: item.title,
                description: item.description ?? '',
                budgetMinor: item.amountMinor ?? null,
                payoutMethod: item.payout === 'DIRECT_TO_PROVIDER' ? 'VENDOR_DIRECT' : 'CREATOR_PAYOUT',
              })),
            },
            media: {
              create: input.media.map((item, index) => ({
                mediaAssetId: item.mediaId,
                position: index + 1,
                altText: item.altText ?? null,
                showsMinor: item.showsMinor,
              })),
            },
            ledgerAccounts: {
              create: { code: `campaign:${campaignId}:held`, type: 'LIABILITY', currency: 'PHP' },
            },
          },
        });
        await tx.auditLog.create({
          data: {
            actorType: 'USER',
            actorId: creator.id,
            action: 'CAMPAIGN_SUBMITTED',
            entityType: 'campaign',
            entityId: campaignId,
            after: {
              slug,
              fundingType: input.fundingType,
              goalMinor: plan.goalMinor?.toString() ?? null,
              mediaCount: input.media.length,
            },
            requestId: meta.requestId,
            ip: meta.ip,
            userAgent: meta.userAgent,
          },
        });
        // Picked up by the moderation pipeline: malware scan, EXIF strip, AI pre-screen, human review.
        await tx.outboxEvent.create({
          data: {
            aggregateType: 'campaign',
            aggregateId: campaignId,
            eventType: 'campaign.submitted',
            payload: { campaignId, creatorId: creator.id },
            messageGroup: campaignId,
          },
        });
      });
    } catch (error) {
      if (isDbRefusal(error, /not KYC-verified/)) {
        throw new ForbiddenException({ message: 'Verify your ID before posting', code: 'KYC_REQUIRED' });
      }
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          message: 'These photos or videos were already posted',
          code: 'MEDIA_ALREADY_USED',
        });
      }
      throw error;
    }

    return { id: campaignId, slug, status: 'PENDING_REVIEW' };
  }
}
