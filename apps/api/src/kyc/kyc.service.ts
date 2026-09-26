// apps/api/src/kyc/kyc.service.ts
//
// Creator identity verification (the KYC front gate).
//
// User side:
//   1. POST /kyc/challenge       a one-time code to write on paper (60 minutes)
//   2. POST /uploads             ID front, ID back (not for passports), and a selfie holding the ID and
//                                the code; all go to the restricted bucket
//   3. POST /kyc/verifications   submit: kyc_status -> PENDING_ID
// Staff side (REVIEWER role):
//   GET  /review/kyc, GET /review/kyc/:id (5-minute image links, audit-logged),
//   POST /review/kyc/:id/decision        APPROVE -> VERIFIED (until kyc_expires_at) | REJECT
//   POST /review/kyc/users/:id/revoke    REVOKED, and the user's open campaigns are frozen
//
// Humans approve identities (TECHNICAL_PLAN.md 0.3); nothing here is automatic. A KYC vendor can take
// over steps 1 to 3 later: identity_verifications.provider/provider_ref already record one.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AUTH_SECRET } from '../auth/auth-secret.provider.js';
import { maskPhone } from '../auth/otp.js';
import { decodeTimeCursor, encodeTimeCursor, type Page } from '../common/http/cursor.js';
import type { RequestMeta } from '../common/http/request-meta.js';
import { isUniqueViolation } from '../common/db/db-errors.js';
import type { Env } from '../config/env.schema.js';
import type { User } from '../generated/prisma/client.js';
import type { GovernmentIdType, IdentityCheckStatus, KycDocumentKind } from '../generated/prisma/enums.js';
import { MediaService } from '../media/media.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { issueKycChallenge, verifyKycChallenge } from './kyc-challenge.js';
import {
  effectiveKycStatus,
  endOfManilaDay,
  kycExpiry,
  requiresIdBack,
  verificationSubmitBlock,
  type KycRejectionReason,
} from './kyc-policy.js';

const DAY_MS = 86_400_000;

export interface KycChallengeDto {
  challengeCode: string;
  challengeToken: string;
  expiresAt: string;
}

export interface SubmitVerificationInput {
  idType: GovernmentIdType;
  displayName: string;
  challengeToken: string;
  documents: { idFront: string; idBack?: string | undefined; selfieWithId: string };
}

export interface ReviewQueueItem {
  id: string;
  userId: string;
  phoneMasked: string | null;
  displayName: string;
  idType: GovernmentIdType;
  challengeCode: string;
  submittedAt: string;
  previousAttempts: number;
}

export interface ReviewDetail extends ReviewQueueItem {
  status: IdentityCheckStatus;
  documents: Array<{ kind: KycDocumentKind; viewUrl: string; mimeType: string }>;
}

export type KycDecisionInput =
  | { decision: 'APPROVE'; idExpiresOn?: Date | undefined; note?: string | undefined }
  | { decision: 'REJECT'; rejectionReason: KycRejectionReason; note?: string | undefined };

const SUBMIT_BLOCK_ERRORS = {
  ALREADY_VERIFIED: () =>
    new ConflictException({ message: 'Your ID is already verified', code: 'KYC_ALREADY_VERIFIED' }),
  PENDING_REVIEW: () =>
    new ConflictException({ message: 'Your ID is already being reviewed', code: 'KYC_PENDING' }),
  REVOKED: () =>
    new ForbiddenException({
      message: 'Verification was revoked. Contact AbotKamay support.',
      code: 'KYC_REVOKED',
    }),
} as const;

@Injectable()
export class KycService {
  private readonly reverifyMonths: number;
  private readonly mediaRetentionDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    @Inject(AUTH_SECRET) private readonly secret: Buffer,
    config: ConfigService<Env, true>,
  ) {
    this.reverifyMonths = config.get('KYC_REVERIFY_MONTHS', { infer: true });
    this.mediaRetentionDays = config.get('KYC_MEDIA_RETENTION_DAYS', { infer: true });
  }

  issueChallenge(user: User): KycChallengeDto {
    const block = verificationSubmitBlock(user);
    if (block) throw SUBMIT_BLOCK_ERRORS[block]();
    const challenge = issueKycChallenge(this.secret, user.id);
    return {
      challengeCode: challenge.code,
      challengeToken: challenge.token,
      expiresAt: challenge.expiresAt.toISOString(),
    };
  }

  async submit(
    user: User,
    input: SubmitVerificationInput,
    meta: RequestMeta,
  ): Promise<{ verificationId: string }> {
    const block = verificationSubmitBlock(user);
    if (block) throw SUBMIT_BLOCK_ERRORS[block]();

    const challenge = verifyKycChallenge(this.secret, user.id, input.challengeToken);
    if (!challenge.ok) {
      throw new BadRequestException({
        message:
          challenge.reason === 'EXPIRED'
            ? 'Your code expired. Get a new code and retake the selfie.'
            : 'Invalid challenge code',
        code: challenge.reason === 'EXPIRED' ? 'KYC_CHALLENGE_EXPIRED' : 'KYC_CHALLENGE_INVALID',
      });
    }
    if (requiresIdBack(input.idType) && !input.documents.idBack) {
      throw new BadRequestException({
        message: 'Add a photo of the back of your ID',
        code: 'KYC_ID_BACK_REQUIRED',
        issues: [{ path: 'documents.idBack', message: 'Required for this ID' }],
      });
    }

    const documents: Array<{ kind: KycDocumentKind; mediaId: string }> = [
      { kind: 'ID_FRONT', mediaId: input.documents.idFront },
      ...(input.documents.idBack ? [{ kind: 'ID_BACK' as const, mediaId: input.documents.idBack }] : []),
      { kind: 'SELFIE_WITH_ID', mediaId: input.documents.selfieWithId },
    ];
    await this.media.claim(
      user.id,
      documents.map((document) => document.mediaId),
      'KYC_DOCUMENT',
    );

    // A verified user renewing keeps posting while the renewal is reviewed; everyone else waits.
    const staysVerified = effectiveKycStatus(user) === 'VERIFIED';
    try {
      return await this.prisma.$transaction(async (tx) => {
        const verification = await tx.identityVerification.create({
          data: {
            userId: user.id,
            idType: input.idType,
            displayName: input.displayName,
            challengeCode: challenge.code,
            documents: {
              create: documents.map((document) => ({ kind: document.kind, mediaAssetId: document.mediaId })),
            },
          },
        });
        if (!staysVerified) {
          await tx.user.update({ where: { id: user.id }, data: { kycStatus: 'PENDING_ID' } });
        }
        await tx.auditLog.create({
          data: {
            actorType: 'USER',
            actorId: user.id,
            action: 'KYC_SUBMITTED',
            entityType: 'identity_verification',
            entityId: verification.id,
            after: { idType: input.idType, documents: documents.map((document) => document.kind) },
            requestId: meta.requestId,
            ip: meta.ip,
            userAgent: meta.userAgent,
          },
        });
        await tx.outboxEvent.create({
          data: {
            aggregateType: 'identity_verification',
            aggregateId: verification.id,
            eventType: 'kyc.verification.submitted',
            payload: { verificationId: verification.id, userId: user.id },
          },
        });
        return { verificationId: verification.id };
      });
    } catch (error) {
      // identity_verifications_one_submitted_per_user, or a document already used in another check.
      if (isUniqueViolation(error)) throw SUBMIT_BLOCK_ERRORS.PENDING_REVIEW();
      throw error;
    }
  }

  // ------------------------------------------------------------------------------------ Review

  async queue(cursor: string | undefined, limit: number): Promise<Page<ReviewQueueItem>> {
    const after = cursor ? decodeTimeCursor(cursor) : null;
    const rows = await this.prisma.identityVerification.findMany({
      where: {
        status: 'SUBMITTED',
        ...(after
          ? { OR: [{ submittedAt: { gt: after.at } }, { submittedAt: after.at, id: { gt: after.id } }] }
          : {}),
      },
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }], // oldest first: first come, first reviewed
      take: limit + 1,
      include: { user: { select: { phoneE164: true, _count: { select: { identityVerifications: true } } } } },
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => ({
        id: row.id,
        userId: row.userId,
        phoneMasked: row.user.phoneE164 ? maskPhone(row.user.phoneE164) : null,
        displayName: row.displayName,
        idType: row.idType,
        challengeCode: row.challengeCode,
        submittedAt: row.submittedAt.toISOString(),
        previousAttempts: row.user._count.identityVerifications - 1,
      })),
      nextCursor: rows.length > limit && last ? encodeTimeCursor(last.submittedAt, last.id) : null,
    };
  }

  async detail(reviewer: User, id: string, meta: RequestMeta): Promise<ReviewDetail> {
    const row = await this.prisma.identityVerification.findUnique({
      where: { id },
      include: {
        documents: { include: { mediaAsset: true } },
        user: { select: { phoneE164: true, _count: { select: { identityVerifications: true } } } },
      },
    });
    if (!row) throw new NotFoundException({ message: 'Verification not found', code: 'NOT_FOUND' });
    if (row.userId === reviewer.id) {
      throw new ForbiddenException({ message: 'You cannot review your own verification', code: 'FOUR_EYES' });
    }

    const documents = await Promise.all(
      row.documents.map(async (document) => ({
        kind: document.kind,
        mimeType: document.mediaAsset.mimeType,
        viewUrl: await this.media.viewRestricted(document.mediaAsset),
      })),
    );
    await this.prisma.auditLog.create({
      data: {
        actorType: 'USER',
        actorId: reviewer.id,
        action: 'EVIDENCE_VIEWED',
        entityType: 'identity_verification',
        entityId: row.id,
        after: { reason: 'KYC_REVIEW', documents: row.documents.map((document) => document.kind) },
        requestId: meta.requestId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    return {
      id: row.id,
      userId: row.userId,
      phoneMasked: row.user.phoneE164 ? maskPhone(row.user.phoneE164) : null,
      displayName: row.displayName,
      idType: row.idType,
      challengeCode: row.challengeCode,
      submittedAt: row.submittedAt.toISOString(),
      previousAttempts: row.user._count.identityVerifications - 1,
      status: row.status,
      documents,
    };
  }

  async decide(
    reviewer: User,
    id: string,
    input: KycDecisionInput,
    meta: RequestMeta,
  ): Promise<{ status: IdentityCheckStatus }> {
    const now = new Date();
    if (input.decision === 'APPROVE' && input.idExpiresOn && endOfManilaDay(input.idExpiresOn) <= now) {
      throw new BadRequestException({
        message: 'The ID has expired; reject with ID_EXPIRED',
        code: 'ID_EXPIRED',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const verification = await tx.identityVerification.findUnique({
        where: { id },
        include: { user: true },
      });
      if (!verification)
        throw new NotFoundException({ message: 'Verification not found', code: 'NOT_FOUND' });
      if (verification.userId === reviewer.id) {
        throw new ForbiddenException({
          message: 'You cannot review your own verification',
          code: 'FOUR_EYES',
        });
      }
      // Conditional update: two reviewers deciding at once cannot both win.
      const decided = await tx.identityVerification.updateMany({
        where: { id, status: 'SUBMITTED' },
        data: {
          status: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          reviewerId: reviewer.id,
          decidedAt: now,
          reviewNote: input.note ?? null,
          rejectionReason: input.decision === 'REJECT' ? input.rejectionReason : null,
          idExpiresOn: input.decision === 'APPROVE' ? (input.idExpiresOn ?? null) : null,
          mediaPurgeAfter: new Date(now.getTime() + this.mediaRetentionDays * DAY_MS),
        },
      });
      if (decided.count !== 1) {
        throw new ConflictException({
          message: 'This verification was already decided',
          code: 'ALREADY_DECIDED',
        });
      }

      const user = verification.user;
      const before = { kycStatus: user.kycStatus, kycExpiresAt: user.kycExpiresAt?.toISOString() ?? null };
      let after: Record<string, string | null>;
      if (input.decision === 'APPROVE') {
        const kycExpiresAt = kycExpiry(now, input.idExpiresOn ?? null, this.reverifyMonths);
        await tx.user.update({
          where: { id: user.id },
          data: {
            kycStatus: 'VERIFIED',
            kycVerifiedAt: now,
            kycExpiresAt,
            displayName: verification.displayName,
          },
        });
        after = { kycStatus: 'VERIFIED', kycExpiresAt: kycExpiresAt.toISOString() };
      } else {
        // A renewal that fails leaves a still-valid verification in place until it expires.
        const keepVerified = effectiveKycStatus(user, now) === 'VERIFIED';
        if (!keepVerified) await tx.user.update({ where: { id: user.id }, data: { kycStatus: 'REJECTED' } });
        after = { kycStatus: keepVerified ? 'VERIFIED' : 'REJECTED', rejectionReason: input.rejectionReason };
      }

      await tx.auditLog.create({
        data: {
          actorType: 'USER',
          actorId: reviewer.id,
          action: input.decision === 'APPROVE' ? 'KYC_APPROVED' : 'KYC_REJECTED',
          entityType: 'identity_verification',
          entityId: id,
          before,
          after,
          requestId: meta.requestId,
          ip: meta.ip,
          userAgent: meta.userAgent,
        },
      });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'identity_verification',
          aggregateId: id,
          eventType: 'kyc.verification.decided',
          payload: { verificationId: id, userId: user.id, decision: input.decision },
        },
      });
      return { status: input.decision === 'APPROVE' ? ('APPROVED' as const) : ('REJECTED' as const) };
    });
  }

  /** Fraud or a substantiated complaint: revoke, and freeze the user's open campaigns. */
  async revoke(
    reviewer: User,
    userId: string,
    reason: string,
    meta: RequestMeta,
  ): Promise<{ frozenCampaigns: number }> {
    if (userId === reviewer.id) {
      throw new ForbiddenException({ message: 'You cannot revoke your own verification', code: 'FOUR_EYES' });
    }
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException({ message: 'User not found', code: 'NOT_FOUND' });

      await tx.user.update({ where: { id: userId }, data: { kycStatus: 'REVOKED' } });
      await tx.identityVerification.updateMany({
        where: { userId, status: 'SUBMITTED' },
        data: { status: 'WITHDRAWN', decidedAt: new Date() },
      });
      const frozen = await tx.campaign.updateMany({
        where: { creatorId: userId, status: { in: ['PENDING_REVIEW', 'ACTIVE', 'PAUSED', 'FUNDED'] } },
        data: { status: 'UNDER_INVESTIGATION' },
      });
      await tx.auditLog.create({
        data: {
          actorType: 'USER',
          actorId: reviewer.id,
          action: 'KYC_REVOKED',
          entityType: 'user',
          entityId: userId,
          before: { kycStatus: user.kycStatus },
          after: { kycStatus: 'REVOKED', reason, frozenCampaigns: frozen.count },
          requestId: meta.requestId,
          ip: meta.ip,
          userAgent: meta.userAgent,
        },
      });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'user',
          aggregateId: userId,
          eventType: 'kyc.revoked',
          payload: { userId, frozenCampaigns: frozen.count },
        },
      });
      return { frozenCampaigns: frozen.count };
    });
  }
}
