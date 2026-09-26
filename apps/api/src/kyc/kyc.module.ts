// apps/api/src/kyc/kyc.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MediaModule } from '../media/media.module.js';
import { KycController, KycReviewController } from './kyc.controller.js';
import { KycService } from './kyc.service.js';

@Module({
  imports: [AuthModule, MediaModule],
  controllers: [KycController, KycReviewController],
  providers: [KycService],
})
export class KycModule {}
