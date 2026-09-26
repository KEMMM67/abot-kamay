// apps/api/src/auth/auth.module.ts
//
// Phone sign-in, sessions, and the guards every other module uses: SessionGuard, KycVerifiedGuard
// (the KYC front gate) and RolesGuard. Import this module wherever those guards are used.
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { authSecretProvider } from './auth-secret.provider.js';
import { AuthService } from './auth.service.js';
import { KycVerifiedGuard, RolesGuard, SessionGuard } from './guards.js';
import { smsSenderProvider } from './sms/sms-sender.js';
import { ViewerService } from './viewer.service.js';

@Module({
  controllers: [AuthController],
  providers: [
    authSecretProvider,
    smsSenderProvider,
    AuthService,
    ViewerService,
    SessionGuard,
    KycVerifiedGuard,
    RolesGuard,
  ],
  exports: [authSecretProvider, AuthService, ViewerService, SessionGuard, KycVerifiedGuard, RolesGuard],
})
export class AuthModule {}
