// apps/api/src/auth/viewer.ts
//
// The signed-in user attached to a request by SessionGuard, and the @CurrentViewer() decorator that
// reads it in controllers.
import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { User } from '../generated/prisma/client.js';

export interface AuthenticatedViewer {
  sessionId: string;
  user: User;
}

declare module 'fastify' {
  interface FastifyRequest {
    viewer?: AuthenticatedViewer;
  }
}

export const CurrentViewer = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<FastifyRequest>();
  if (!request.viewer) {
    // A controller used @CurrentViewer() without SessionGuard: a programming error, never a client one.
    throw new UnauthorizedException({ message: 'Sign in required', code: 'SIGN_IN_REQUIRED' });
  }
  return request.viewer;
});
