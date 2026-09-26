// apps/api/src/auth/guards.ts
//
//   @UseGuards(SessionGuard)                     signed in (Authorization: Bearer <session token>)
//   @UseGuards(SessionGuard, KycVerifiedGuard)   signed in AND allowed to post (the KYC front gate)
//   @UseGuards(SessionGuard, RolesGuard) + @Roles('REVIEWER')   trust and safety staff
//
// The web app keeps the session token in an HttpOnly cookie on its own origin and forwards it from
// the server. The API itself never reads cookies, so it has no CSRF surface.
import {
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import type { Role } from '../generated/prisma/enums.js';
import { canPost, effectiveKycStatus } from '../kyc/kyc-policy.js';
import { AuthService } from './auth.service.js';

function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = bearerToken(request);
    const viewer = token ? await this.auth.resolveSession(token) : null;
    if (!viewer) {
      throw new UnauthorizedException({ message: 'Sign in required', code: 'SIGN_IN_REQUIRED' });
    }
    request.viewer = viewer;
    return true;
  }
}

/** The KYC front gate. Use after SessionGuard. */
@Injectable()
export class KycVerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { viewer } = context.switchToHttp().getRequest<FastifyRequest>();
    if (!viewer) throw new UnauthorizedException({ message: 'Sign in required', code: 'SIGN_IN_REQUIRED' });
    if (!canPost(viewer.user)) {
      throw new ForbiddenException({
        message: 'Verify your government ID before posting or receiving funds',
        code: 'KYC_REQUIRED',
        kycStatus: effectiveKycStatus(viewer.user),
      });
    }
    return true;
  }
}

const ROLES_KEY = 'abotkamay:roles';

/** Any one of the listed roles is enough. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const { viewer } = context.switchToHttp().getRequest<FastifyRequest>();
    if (!viewer) throw new UnauthorizedException({ message: 'Sign in required', code: 'SIGN_IN_REQUIRED' });
    if (!required.some((role) => viewer.user.roles.includes(role))) {
      throw new ForbiddenException({ message: 'Not allowed', code: 'ROLE_REQUIRED' });
    }
    return true;
  }
}
