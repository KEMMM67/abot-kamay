// apps/api/src/kyc/kyc.controller.ts
//
// Creator side of the KYC front gate (signed in):
//   POST /api/v1/kyc/challenge       -> { challengeCode, challengeToken, expiresAt }
//   POST /api/v1/kyc/verifications   { idType, displayName, challengeToken, documents, consent }
//                                    -> 201 { verificationId, viewer }
// Staff side (REVIEWER):
//   GET  /api/v1/review/kyc?cursor=&limit=
//   GET  /api/v1/review/kyc/:id                  (image links expire in 5 minutes; audit-logged)
//   POST /api/v1/review/kyc/:id/decision         { decision: APPROVE, idExpiresOn? } | { decision: REJECT, rejectionReason }
//   POST /api/v1/review/kyc/users/:userId/revoke { reason }
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { RolesGuard, Roles, SessionGuard } from '../auth/guards.js';
import { CurrentViewer, type AuthenticatedViewer } from '../auth/viewer.js';
import { ViewerService, type ViewerDto } from '../auth/viewer.service.js';
import { PageQuerySchema, type Page, type PageQuery } from '../common/http/cursor.js';
import { requestMeta } from '../common/http/request-meta.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { GovernmentIdType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { KYC_REJECTION_REASONS } from './kyc-policy.js';
import { KycService, type KycChallengeDto, type ReviewDetail, type ReviewQueueItem } from './kyc.service.js';

/** Public name shown on posts, e.g. "Ana R.": letters, spaces, periods, apostrophes and hyphens. */
export const DisplayNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^\p{L}[\p{L}\p{M} .'-]*$/u, 'Use letters only, like "Ana R."');

const SubmitVerificationSchema = z.object({
  idType: z.enum(GovernmentIdType),
  displayName: DisplayNameSchema,
  challengeToken: z.string().trim().min(20).max(400),
  documents: z.object({
    idFront: z.uuid(),
    idBack: z.uuid().optional(),
    selfieWithId: z.uuid(),
  }),
  consent: z.object({
    /** Data Privacy Act (RA 10173): explicit consent to process the ID for verification. */
    dataProcessing: z.literal(true),
    /** The ID is the user's own and every detail is true. */
    truthful: z.literal(true),
  }),
});

const DecisionSchema = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('APPROVE'),
    idExpiresOn: z.iso
      .date()
      .transform((value) => new Date(`${value}T00:00:00.000Z`))
      .optional(),
    note: z.string().trim().max(1000).optional(),
  }),
  z.object({
    decision: z.literal('REJECT'),
    rejectionReason: z.enum(KYC_REJECTION_REASONS),
    note: z.string().trim().max(1000).optional(),
  }),
]);

const RevokeSchema = z.object({ reason: z.string().trim().min(10).max(1000) });

@Controller('kyc')
@UseGuards(SessionGuard)
export class KycController {
  constructor(
    private readonly kyc: KycService,
    private readonly viewers: ViewerService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('challenge')
  @HttpCode(HttpStatus.OK)
  challenge(@CurrentViewer() viewer: AuthenticatedViewer): KycChallengeDto {
    return this.kyc.issueChallenge(viewer.user);
  }

  @Post('verifications')
  async submit(
    @CurrentViewer() viewer: AuthenticatedViewer,
    @Body(new ZodValidationPipe(SubmitVerificationSchema)) body: z.infer<typeof SubmitVerificationSchema>,
    @Req() request: FastifyRequest,
  ): Promise<{ verificationId: string; viewer: ViewerDto }> {
    const { verificationId } = await this.kyc.submit(viewer.user, body, requestMeta(request));
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: viewer.user.id } });
    return { verificationId, viewer: await this.viewers.describe(user) };
  }
}

@Controller('review/kyc')
@UseGuards(SessionGuard, RolesGuard)
@Roles('REVIEWER')
export class KycReviewController {
  constructor(private readonly kyc: KycService) {}

  @Get()
  queue(@Query(new ZodValidationPipe(PageQuerySchema)) query: PageQuery): Promise<Page<ReviewQueueItem>> {
    return this.kyc.queue(query.cursor, query.limit);
  }

  @Get(':id')
  detail(
    @CurrentViewer() viewer: AuthenticatedViewer,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: FastifyRequest,
  ): Promise<ReviewDetail> {
    return this.kyc.detail(viewer.user, id, requestMeta(request));
  }

  @Post(':id/decision')
  @HttpCode(HttpStatus.OK)
  decide(
    @CurrentViewer() viewer: AuthenticatedViewer,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(DecisionSchema)) body: z.infer<typeof DecisionSchema>,
    @Req() request: FastifyRequest,
  ) {
    return this.kyc.decide(viewer.user, id, body, requestMeta(request));
  }

  @Post('users/:userId/revoke')
  @HttpCode(HttpStatus.OK)
  revoke(
    @CurrentViewer() viewer: AuthenticatedViewer,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body(new ZodValidationPipe(RevokeSchema)) body: z.infer<typeof RevokeSchema>,
    @Req() request: FastifyRequest,
  ) {
    return this.kyc.revoke(viewer.user, userId, body.reason, requestMeta(request));
  }
}
