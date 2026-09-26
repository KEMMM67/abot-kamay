// apps/api/src/campaigns/campaigns.controller.ts
//
// Public (no sign-in):
//   GET  /api/v1/campaigns?cursor=&limit=                    the feed
//   GET  /api/v1/campaigns/:slug?lang=fil|en                 campaign page (lang: the API-written text)
//   GET  /api/v1/campaigns/:slug/ledger?cursor=&limit=       public ledger
//   GET  /api/v1/campaigns/:slug/spending-reports?cursor=    creator receipts
// Creators:
//   POST /api/v1/campaigns                                   create a post (KYC VERIFIED only)
//   POST /api/v1/campaigns/:slug/spending-reports            post a receipt (the campaign's creator only)
//   GET  /api/v1/me/campaigns                                my posts, including ones in review
import { Body, Controller, Get, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { KycVerifiedGuard, SessionGuard } from '../auth/guards.js';
import { CurrentViewer, type AuthenticatedViewer } from '../auth/viewer.js';
import { PageQuerySchema, type Page, type PageQuery } from '../common/http/cursor.js';
import { requestMeta } from '../common/http/request-meta.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { CreatorRelationship, FundingType, SpendingProofKind } from '../generated/prisma/enums.js';
import {
  AGE_BANDS,
  CONSENT_METHODS,
  MAX_PLAN_ITEMS,
  MAX_POST_MEDIA,
  NEED_CATEGORIES,
  PAYOUT_CHOICES,
} from './campaign-policy.js';
import { CampaignPostsService } from './campaign-posts.service.js';
import { CampaignReadsService } from './campaign-reads.service.js';
import {
  CONTENT_LANGS,
  type CampaignDetailDto,
  type CampaignSummaryDto,
  type CreatedCampaignDto,
  type MyCampaignDto,
  type PublicLedgerEntryDto,
  type SpendingReportDto,
} from './campaign.dto.js';
import { SpendingReportsService } from './spending/spending-reports.service.js';

const CampaignQuerySchema = z.object({ lang: z.enum(CONTENT_LANGS).default('fil') });

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Money arrives as a decimal string of centavos, like every amount the API sends. */
const MinorUnitsSchema = z
  .string()
  .trim()
  .regex(/^\d{1,12}$/, 'Amount in centavos, digits only')
  .transform((value) => BigInt(value));

const CreateCampaignSchema = z
  .object({
    title: z.string().trim().min(8).max(120),
    caption: z.string().trim().min(40).max(5000),
    fundingType: z.enum(FundingType),
    plan: z
      .array(
        z.object({
          title: z.string().trim().min(3).max(80),
          description: z.string().trim().max(300).optional(),
          amountMinor: MinorUnitsSchema.optional(),
          payout: z.enum(PAYOUT_CHOICES),
        }),
      )
      .min(1)
      .max(MAX_PLAN_ITEMS),
    relationship: z.enum(CreatorRelationship),
    beneficiary: z.object({
      alias: z.string().trim().min(2).max(40),
      ageBand: z.enum(AGE_BANDS).optional(),
      region: z.string().trim().min(2).max(60),
      needCategories: z
        .array(z.enum(NEED_CATEGORIES))
        .min(1)
        .max(3)
        .transform((values) => [...new Set(values)]),
      isMinor: z.boolean(),
    }),
    media: z
      .array(
        z.object({
          mediaId: z.uuid(),
          altText: z.string().trim().max(200).optional(),
          showsMinor: z.boolean().default(false),
        }),
      )
      .min(1)
      .max(MAX_POST_MEDIA),
    consent: z.object({
      method: z.enum(CONSENT_METHODS),
      evidenceMediaId: z.uuid().optional(),
    }),
    closesAt: z.iso
      .datetime()
      .transform((value) => new Date(value))
      .optional(),
    /** "Totoo ang lahat ng nakasulat, at may pahintulot ako na i-post ito." */
    attestation: z.literal(true),
  })
  .refine((body) => body.beneficiary.ageBand !== '0-17' || body.beneficiary.isMinor, {
    path: ['beneficiary', 'isMinor'],
    message: 'Age band 0-17 means the person is a minor',
  })
  .refine((body) => !body.closesAt || body.closesAt.getTime() > Date.now() + 86_400_000, {
    path: ['closesAt'],
    message: 'Pick a closing date at least one day from now',
  });

const CreateSpendingReportSchema = z.object({
  title: z.string().trim().min(3).max(120),
  note: z.string().trim().max(1000).optional(),
  amountMinor: MinorUnitsSchema,
  spentOn: z.iso.date(),
  merchantName: z.string().trim().max(120).optional(),
  milestoneId: z.uuid().optional(),
  media: z
    .array(z.object({ mediaId: z.uuid(), kind: z.enum(SpendingProofKind) }))
    .min(1)
    .max(5),
  /** "Totoo ang resibong ito at para sa kampanyang ito ang gastos." */
  attestation: z.literal(true),
});

function notFound(): NotFoundException {
  return new NotFoundException({ message: 'Campaign not found', code: 'NOT_FOUND' });
}

function checkedSlug(slug: string): string {
  if (slug.length > 120 || !SLUG_PATTERN.test(slug)) throw notFound();
  return slug;
}

@Controller('campaigns')
export class CampaignsController {
  constructor(
    private readonly reads: CampaignReadsService,
    private readonly posts: CampaignPostsService,
    private readonly spending: SpendingReportsService,
  ) {}

  @Get()
  list(@Query(new ZodValidationPipe(PageQuerySchema)) query: PageQuery): Promise<Page<CampaignSummaryDto>> {
    return this.reads.list(query.cursor, query.limit);
  }

  @Post()
  @UseGuards(SessionGuard, KycVerifiedGuard)
  create(
    @CurrentViewer() viewer: AuthenticatedViewer,
    @Body(new ZodValidationPipe(CreateCampaignSchema)) body: z.infer<typeof CreateCampaignSchema>,
    @Req() request: FastifyRequest,
  ): Promise<CreatedCampaignDto> {
    return this.posts.create(viewer.user, body, requestMeta(request));
  }

  @Get(':slug')
  async get(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(CampaignQuerySchema)) query: z.infer<typeof CampaignQuerySchema>,
  ): Promise<CampaignDetailDto> {
    const campaign = await this.reads.get(checkedSlug(slug), query.lang);
    if (!campaign) throw notFound();
    return campaign;
  }

  @Get(':slug/ledger')
  async ledger(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(PageQuerySchema)) query: PageQuery,
  ): Promise<Page<PublicLedgerEntryDto>> {
    const page = await this.reads.ledger(checkedSlug(slug), query.cursor, query.limit);
    if (!page) throw notFound();
    return page;
  }

  @Get(':slug/spending-reports')
  async spendingReports(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(PageQuerySchema)) query: PageQuery,
  ): Promise<Page<SpendingReportDto>> {
    const page = await this.reads.spendingReports(checkedSlug(slug), query.cursor, query.limit);
    if (!page) throw notFound();
    return page;
  }

  @Post(':slug/spending-reports')
  @UseGuards(SessionGuard)
  createSpendingReport(
    @CurrentViewer() viewer: AuthenticatedViewer,
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(CreateSpendingReportSchema)) body: z.infer<typeof CreateSpendingReportSchema>,
    @Req() request: FastifyRequest,
  ): Promise<SpendingReportDto> {
    return this.spending.create(viewer.user, checkedSlug(slug), body, requestMeta(request));
  }
}

@Controller('me/campaigns')
@UseGuards(SessionGuard)
export class MyCampaignsController {
  constructor(private readonly reads: CampaignReadsService) {}

  @Get()
  mine(@CurrentViewer() viewer: AuthenticatedViewer): Promise<MyCampaignDto[]> {
    return this.reads.mine(viewer.user.id);
  }
}
