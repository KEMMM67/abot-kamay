// apps/api/src/campaigns/campaign-review.controller.ts
//
// Trust and safety (REVIEWER role). Every media link expires in 5 minutes and every view is
// audit-logged. A reviewer can never decide on their own post or report (four-eyes).
//   GET  /api/v1/review/campaigns?cursor=&limit=
//   POST /api/v1/review/campaigns/:id/decision          { decision: PUBLISH, minorsBlurred? } | { decision: REJECT, note }
//   GET  /api/v1/review/spending-reports?cursor=&limit=
//   POST /api/v1/review/spending-reports/:id/decision   { decision: VERIFY | REJECT, note? }
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
import { Roles, RolesGuard, SessionGuard } from '../auth/guards.js';
import { CurrentViewer, type AuthenticatedViewer } from '../auth/viewer.js';
import { PageQuerySchema, type Page, type PageQuery } from '../common/http/cursor.js';
import { requestMeta } from '../common/http/request-meta.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { CampaignModerationService, type PendingPost } from './campaign-moderation.service.js';
import type { SpendingReportDto } from './campaign.dto.js';
import { SpendingReportsService, type ReviewQueueReport } from './spending/spending-reports.service.js';

const PostDecisionSchema = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('PUBLISH'),
    minorsBlurred: z.boolean().optional(),
    note: z.string().trim().max(1000).optional(),
  }),
  z.object({ decision: z.literal('REJECT'), note: z.string().trim().min(10).max(1000) }),
]);

const SpendingDecisionSchema = z.object({
  decision: z.enum(['VERIFY', 'REJECT']),
  note: z.string().trim().max(1000).optional(),
});

@Controller('review')
@UseGuards(SessionGuard, RolesGuard)
@Roles('REVIEWER')
export class CampaignReviewController {
  constructor(
    private readonly moderation: CampaignModerationService,
    private readonly spending: SpendingReportsService,
  ) {}

  @Get('campaigns')
  pendingPosts(
    @CurrentViewer() viewer: AuthenticatedViewer,
    @Query(new ZodValidationPipe(PageQuerySchema)) query: PageQuery,
    @Req() request: FastifyRequest,
  ): Promise<Page<PendingPost>> {
    return this.moderation.queue(viewer.user, query.cursor, query.limit, requestMeta(request));
  }

  @Post('campaigns/:id/decision')
  @HttpCode(HttpStatus.OK)
  decidePost(
    @CurrentViewer() viewer: AuthenticatedViewer,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(PostDecisionSchema)) body: z.infer<typeof PostDecisionSchema>,
    @Req() request: FastifyRequest,
  ) {
    return this.moderation.decide(viewer.user, id, body, requestMeta(request));
  }

  @Get('spending-reports')
  pendingReports(
    @Query(new ZodValidationPipe(PageQuerySchema)) query: PageQuery,
  ): Promise<Page<ReviewQueueReport>> {
    return this.spending.queue(query.cursor, query.limit);
  }

  @Post('spending-reports/:id/decision')
  @HttpCode(HttpStatus.OK)
  decideReport(
    @CurrentViewer() viewer: AuthenticatedViewer,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(SpendingDecisionSchema)) body: z.infer<typeof SpendingDecisionSchema>,
    @Req() request: FastifyRequest,
  ): Promise<SpendingReportDto> {
    return this.spending.decide(viewer.user, id, body, requestMeta(request));
  }
}
