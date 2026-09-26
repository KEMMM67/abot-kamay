// apps/api/src/ai/ai.module.ts
//
// AI integration module. Planned additions beside screening/: duplicate adjudication
// (dedupe/), receipt checks (receipts/), story drafting and claim checking (stories/).
import { Module } from '@nestjs/common';
import { AiGatewayService } from './ai-gateway.service.js';
import { anthropicClientProvider } from './anthropic.provider.js';
import { ScreeningService } from './screening/screening.service.js';

@Module({
  providers: [anthropicClientProvider, AiGatewayService, ScreeningService],
  exports: [AiGatewayService, ScreeningService],
})
export class AiModule {}
