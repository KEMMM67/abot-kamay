// apps/api/src/auth/auth.service.ts
//
// Phone sign-in with a one-time SMS code, and opaque server-side sessions.
//
// Abuse limits (counted in the database, so they hold across API instances):
//   - at most 3 codes per phone number per 15 minutes, and 20 per IP address per hour;
//   - at most 5 wrong guesses per code (also a DB CHECK), after which the code is dead;
//   - a code is consumed exactly once (conditional UPDATE), even if two requests race.
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { safeEqual } from '../common/crypto/safe-compare.js';
import type { RequestMeta } from '../common/http/request-meta.js';
import { uuidv7 } from '../common/ids/uuidv7.js';
import type { Env } from '../config/env.schema.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AUTH_SECRET } from './auth-secret.provider.js';
import {
  generateOtpCode,
  hashOtp,
  hashSessionToken,
  isWellFormedSessionToken,
  maskPhone,
  newSessionToken,
  normalizePhMobile,
  OTP_MAX_ATTEMPTS,
  otpSmsMessage,
} from './otp.js';
import { LogSmsSender, SMS_SENDER, type SmsSender } from './sms/sms-sender.js';
import type { AuthenticatedViewer } from './viewer.js';

const PHONE_WINDOW_MS = 15 * 60_000;
const MAX_CODES_PER_PHONE = 3;
const IP_WINDOW_MS = 60 * 60_000;
const MAX_CODES_PER_IP = 20;
const LAST_SEEN_RESOLUTION_MS = 10 * 60_000;

export interface OtpRequested {
  challengeId: string;
  expiresAt: string;
  phoneMasked: string;
  /** Development and test with SMS_PROVIDER=log only: the code, so the web app can show it. */
  devCode?: string;
}

export interface SignedIn {
  token: string;
  expiresAt: Date;
  user: User;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly otpTtlMs: number;
  private readonly sessionTtlMs: number;
  private readonly exposeDevCode: boolean;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUTH_SECRET) private readonly secret: Buffer,
    @Inject(SMS_SENDER) private readonly sms: SmsSender | null,
    config: ConfigService<Env, true>,
  ) {
    this.otpTtlMs = config.get('OTP_TTL_SECONDS', { infer: true }) * 1000;
    this.sessionTtlMs = config.get('SESSION_TTL_DAYS', { infer: true }) * 86_400_000;
    const nodeEnv = config.get('NODE_ENV', { infer: true });
    this.exposeDevCode = sms instanceof LogSmsSender && (nodeEnv === 'development' || nodeEnv === 'test');
  }

  async requestOtp(rawPhone: string, meta: RequestMeta): Promise<OtpRequested> {
    const phone = normalizePhMobile(rawPhone);
    if (!phone) {
      throw new BadRequestException({
        message: 'Enter a Philippine mobile number',
        code: 'INVALID_PHONE',
        issues: [{ path: 'phone', message: 'Enter a Philippine mobile number, like 0917 123 4567' }],
      });
    }
    if (!this.sms) {
      throw new ServiceUnavailableException({
        message: 'SMS sign-in is not configured',
        code: 'SMS_NOT_CONFIGURED',
      });
    }

    const now = Date.now();
    const [perPhone, perIp] = await Promise.all([
      this.prisma.otpChallenge.count({
        where: { phoneE164: phone, createdAt: { gt: new Date(now - PHONE_WINDOW_MS) } },
      }),
      meta.ip
        ? this.prisma.otpChallenge.count({
            where: { ip: meta.ip, createdAt: { gt: new Date(now - IP_WINDOW_MS) } },
          })
        : Promise.resolve(0),
    ]);
    if (perPhone >= MAX_CODES_PER_PHONE || perIp >= MAX_CODES_PER_IP) {
      throw new HttpException(
        { message: 'Too many sign-in codes requested. Try again later.', code: 'OTP_RATE_LIMITED' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const id = uuidv7(now);
    const code = generateOtpCode();
    const expiresAt = new Date(now + this.otpTtlMs);
    await this.prisma.otpChallenge.create({
      data: { id, phoneE164: phone, codeHash: hashOtp(this.secret, id, code), expiresAt, ip: meta.ip },
    });
    await this.sms.send(phone, otpSmsMessage(code, Math.round(this.otpTtlMs / 60_000)));

    return {
      challengeId: id,
      expiresAt: expiresAt.toISOString(),
      phoneMasked: maskPhone(phone),
      ...(this.exposeDevCode ? { devCode: code } : {}),
    };
  }

  async verifyOtp(challengeId: string, code: string, meta: RequestMeta): Promise<SignedIn> {
    const expired = () =>
      new UnauthorizedException({
        message: 'This code has expired. Request a new one.',
        code: 'OTP_EXPIRED',
      });
    const now = new Date();
    const challenge = await this.prisma.otpChallenge.findUnique({ where: { id: challengeId } });
    if (
      !challenge ||
      challenge.consumedAt ||
      challenge.expiresAt <= now ||
      challenge.attempts >= OTP_MAX_ATTEMPTS
    ) {
      throw expired();
    }

    if (!safeEqual(hashOtp(this.secret, challenge.id, code), challenge.codeHash)) {
      await this.prisma.otpChallenge.updateMany({
        where: { id: challenge.id, attempts: { lt: OTP_MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      });
      const attemptsLeft = Math.max(0, OTP_MAX_ATTEMPTS - challenge.attempts - 1);
      if (attemptsLeft === 0) throw expired();
      throw new UnauthorizedException({ message: 'Wrong code', code: 'OTP_INVALID', attemptsLeft });
    }

    return this.prisma.$transaction(async (tx) => {
      const consumed = await tx.otpChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) throw expired();

      const user = await tx.user.upsert({
        where: { phoneE164: challenge.phoneE164 },
        create: { phoneE164: challenge.phoneE164 },
        update: {},
      });
      if (user.status !== 'ACTIVE' || user.deletedAt) {
        throw new ForbiddenException({ message: 'This account cannot sign in', code: 'ACCOUNT_DISABLED' });
      }

      const { token, tokenHash } = newSessionToken();
      const expiresAt = new Date(now.getTime() + this.sessionTtlMs);
      const session = await tx.authSession.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
          ip: meta.ip,
          userAgent: meta.userAgent,
          lastSeenAt: now,
        },
      });
      await tx.auditLog.create({
        data: {
          actorType: 'USER',
          actorId: user.id,
          action: 'SIGNED_IN',
          entityType: 'auth_session',
          entityId: session.id,
          requestId: meta.requestId,
          ip: meta.ip,
          userAgent: meta.userAgent,
        },
      });
      return { token, expiresAt, user };
    });
  }

  /** The session behind a bearer token, or null when it is unknown, expired, revoked or disabled. */
  async resolveSession(token: string): Promise<AuthenticatedViewer | null> {
    if (!isWellFormedSessionToken(token)) return null;
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: true },
    });
    const now = new Date();
    if (!session || session.revokedAt || session.expiresAt <= now) return null;
    if (session.user.status !== 'ACTIVE' || session.user.deletedAt) return null;

    if (!session.lastSeenAt || now.getTime() - session.lastSeenAt.getTime() > LAST_SEEN_RESOLUTION_MS) {
      try {
        await this.prisma.authSession.update({ where: { id: session.id }, data: { lastSeenAt: now } });
      } catch (error) {
        this.logger.warn(`Could not update last_seen_at for session ${session.id}: ${String(error)}`);
      }
    }
    return { sessionId: session.id, user: session.user };
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
