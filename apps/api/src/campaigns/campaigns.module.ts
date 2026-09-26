// apps/api/src/campaigns/campaigns.module.ts
//
// Creator posts (campaigns): creation behind the KYC front gate, the public feed and campaign pages,
// creator spending reports, and trust and safety review.
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MediaModule } from '../media/media.module.js';
import { CampaignModerationService } from './campaign-moderation.service.js';
import { CampaignPostsService } from './campaign-posts.service.js';
import { CampaignReadsService } from './campaign-reads.service.js';
import { CampaignReviewController } from './campaign-review.controller.js';
import { CampaignsController, MyCampaignsController } from './campaigns.controller.js';
import { SpendingReportsService } from './spending/spending-reports.service.js';

@Module({
  imports: [AuthModule, MediaModule],
  controllers: [CampaignsController, MyCampaignsController, CampaignReviewController],
  providers: [CampaignReadsService, CampaignPostsService, CampaignModerationService, SpendingReportsService],
})
export class CampaignsModule {}
