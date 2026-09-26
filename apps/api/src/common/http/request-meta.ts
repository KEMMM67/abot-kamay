// apps/api/src/common/http/request-meta.ts
//
// Client details recorded on sessions, sign-in challenges and audit rows, and used for the per-IP
// sign-in code limit.
//
// Most calls reach the API from the web app's server (Server Actions and Server Components on Vercel),
// not from the visitor's browser, so the connecting address is Vercel's, shared by every visitor. The
// web server therefore reports the visitor's address in X-AbotKamay-Client-IP, together with the
// FORWARDED_IP_SECRET both services share. The API believes that header only with the right secret;
// anyone else calling the API directly gets request.ip, which Fastify takes from X-Forwarded-For
// (trustProxy in main.ts; on Render the first entry is the client as Render's edge saw it).
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { FastifyRequest } from 'fastify';

export const CLIENT_IP_HEADER = 'x-abotkamay-client-ip';
export const FORWARDING_SECRET_HEADER = 'x-abotkamay-forwarding-secret';

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

let forwardingSecret: Buffer | null = null;

/**
 * Called once at startup (main.ts) with FORWARDED_IP_SECRET. Without a secret, forwarded addresses are
 * ignored and every request is attributed to request.ip.
 */
export function trustForwardedClientIp(secret: string | undefined): void {
  forwardingSecret = secret ? Buffer.from(secret, 'utf8') : null;
}

function firstHeader(value: string | string[] | undefined): string | null {
  const text = Array.isArray(value) ? value[0] : value;
  return text ? text.slice(0, 512) : null;
}

/** The visitor's address as reported by the web server, if the report proves where it came from. */
function forwardedClientIp(request: FastifyRequest): string | null {
  if (!forwardingSecret) return null;
  const presented = firstHeader(request.headers[FORWARDING_SECRET_HEADER]);
  const address = firstHeader(request.headers[CLIENT_IP_HEADER])?.trim();
  if (!presented || !address || isIP(address) === 0) return null;
  const given = Buffer.from(presented, 'utf8');
  return given.length === forwardingSecret.length && timingSafeEqual(given, forwardingSecret)
    ? address
    : null;
}

export function requestMeta(request: FastifyRequest): RequestMeta {
  return {
    ip: forwardedClientIp(request) ?? (request.ip || null),
    userAgent: firstHeader(request.headers['user-agent']),
    requestId: firstHeader(request.headers['x-request-id']),
  };
}
