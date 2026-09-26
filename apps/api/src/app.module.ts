// apps/api/src/app.module.ts
//
// Root module of the AbotKamay API. Each bounded context is its own module:
//   PrismaModule   -> database access (Prisma 7 + @prisma/adapter-pg on Neon)
//   HealthModule   -> liveness/readiness probes for the load balancer
//   LedgerModule   -> append-only, double-entry, hash-chained public ledger
//   PaymentsModule -> payment gateway webhooks (PayMongo, Xendit, Stripe) with duplicate-safe intake
//   AiModule       -> AI gateway (Claude) + submission screening
//   AuthModule     -> phone sign-in (SMS one-time code), sessions, and the KYC and role guards
//   MediaModule    -> presigned direct-to-storage uploads (quarantine and restricted buckets)
//   KycModule      -> creator ID verification (the KYC front gate) and its review queue
//   CampaignsModule-> creator posts, the public feed and campaign pages, spending reports, moderation
// Planned next: DonationsModule, DisbursementsModule, NotificationsModule, the outbox relay and the
// media worker (malware scan, EXIF strip, face blur, promotion to the public bucket).
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from './ai/ai.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CampaignsModule } from './campaigns/campaigns.module.js';
import { validateEnv } from './config/env.schema.js';
import { HealthModule } from './health/health.module.js';
import { KycModule } from './kyc/kyc.module.js';
import { LedgerModule } from './ledger/ledger.module.js';
import { MediaModule } from './media/media.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // apps/api/.env wins over the repository-root .env
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    LedgerModule,
    PaymentsModule,
    AiModule,
    AuthModule,
    MediaModule,
    KycModule,
    CampaignsModule,
  ],
})
export class AppModule {}
