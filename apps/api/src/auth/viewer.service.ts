// apps/api/src/auth/viewer.service.ts
//
// The signed-in user's own view of their account: public name, masked phone, and where they stand
// on the KYC front gate. Mirrors `Viewer` in apps/web/lib/types.ts.
import { Injectable } from '@nestjs/common';
import type { User } from '../generated/prisma/client.js';
import type { GovernmentIdType, IdentityCheckStatus, KycStatus } from '../generated/prisma/enums.js';
import { canPost, effectiveKycStatus } from '../kyc/kyc-policy.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { maskPhone } from './otp.js';

export interface ViewerDto {
  id: string;
  displayName: string | null;
  phoneMasked: string | null;
  /** EXPIRED once a verification has lapsed, even though the stored status is still VERIFIED. */
  kycStatus: KycStatus;
  kycVerifiedAt: string | null;
  kycExpiresAt: string | null;
  /** The KYC front gate: true only when this user may post and receive funds right now. */
  canPost: boolean;
  latestVerification: {
    id: string;
    status: IdentityCheckStatus;
    idType: GovernmentIdType;
    submittedAt: string;
    decidedAt: string | null;
    rejectionReason: string | null;
  } | null;
}

@Injectable()
export class ViewerService {
  constructor(private readonly prisma: PrismaService) {}

  async describe(user: User): Promise<ViewerDto> {
    const latest = await this.prisma.identityVerification.findFirst({
      where: { userId: user.id },
      orderBy: { submittedAt: 'desc' },
    });
    return {
      id: user.id,
      displayName: user.displayName,
      phoneMasked: user.phoneE164 ? maskPhone(user.phoneE164) : null,
      kycStatus: effectiveKycStatus(user),
      kycVerifiedAt: user.kycVerifiedAt?.toISOString() ?? null,
      kycExpiresAt: user.kycExpiresAt?.toISOString() ?? null,
      canPost: canPost(user),
      latestVerification: latest && {
        id: latest.id,
        status: latest.status,
        idType: latest.idType,
        submittedAt: latest.submittedAt.toISOString(),
        decidedAt: latest.decidedAt?.toISOString() ?? null,
        rejectionReason: latest.rejectionReason,
      },
    };
  }
}
