// apps/api/src/auth/auth.controller.ts
//
// POST /api/v1/auth/otp          { phone }                -> 202 { challengeId, expiresAt, phoneMasked }
// POST /api/v1/auth/otp/verify   { challengeId, code }    -> 200 { token, expiresAt, viewer }
// POST /api/v1/auth/logout       (signed in)              -> 204
// GET  /api/v1/me                (signed in)              -> the viewer, including their KYC status
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requestMeta } from '../common/http/request-meta.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { AuthService, type OtpRequested } from './auth.service.js';
import { SessionGuard } from './guards.js';
import { OTP_LENGTH } from './otp.js';
import { CurrentViewer, type AuthenticatedViewer } from './viewer.js';
import { ViewerService, type ViewerDto } from './viewer.service.js';

const RequestOtpSchema = z.object({
  phone: z.string().trim().min(10).max(20),
});

const VerifyOtpSchema = z.object({
  challengeId: z.uuid(),
  code: z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), `Enter the ${OTP_LENGTH}-digit code`),
});

export interface SignInResponse {
  /** Opaque session token. The web app stores it in an HttpOnly cookie; never in localStorage. */
  token: string;
  expiresAt: string;
  viewer: ViewerDto;
}

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly viewers: ViewerService,
  ) {}

  @Post('auth/otp')
  @HttpCode(HttpStatus.ACCEPTED)
  requestOtp(
    @Body(new ZodValidationPipe(RequestOtpSchema)) body: z.infer<typeof RequestOtpSchema>,
    @Req() request: FastifyRequest,
  ): Promise<OtpRequested> {
    return this.auth.requestOtp(body.phone, requestMeta(request));
  }

  @Post('auth/otp/verify')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body(new ZodValidationPipe(VerifyOtpSchema)) body: z.infer<typeof VerifyOtpSchema>,
    @Req() request: FastifyRequest,
  ): Promise<SignInResponse> {
    const signedIn = await this.auth.verifyOtp(body.challengeId, body.code, requestMeta(request));
    return {
      token: signedIn.token,
      expiresAt: signedIn.expiresAt.toISOString(),
      viewer: await this.viewers.describe(signedIn.user),
    };
  }

  @Post('auth/logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  async logout(@CurrentViewer() viewer: AuthenticatedViewer): Promise<void> {
    await this.auth.logout(viewer.sessionId);
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentViewer() viewer: AuthenticatedViewer): Promise<ViewerDto> {
    return this.viewers.describe(viewer.user);
  }
}
