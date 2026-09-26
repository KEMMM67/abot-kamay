// apps/api/src/common/http/request-meta.spec.ts
import type { FastifyRequest } from 'fastify';
import {
  CLIENT_IP_HEADER,
  FORWARDING_SECRET_HEADER,
  requestMeta,
  trustForwardedClientIp,
} from './request-meta.js';

const SECRET = 's'.repeat(40);
const VERCEL_IP = '76.76.21.21';

function request(headers: Record<string, string> = {}): FastifyRequest {
  return { ip: VERCEL_IP, headers: { 'user-agent': 'Next.js', ...headers } } as unknown as FastifyRequest;
}

describe('requestMeta', () => {
  afterEach(() => trustForwardedClientIp(undefined));

  it('uses the connecting address when no forwarding secret is configured', () => {
    const meta = requestMeta(
      request({ [CLIENT_IP_HEADER]: '203.0.113.7', [FORWARDING_SECRET_HEADER]: SECRET }),
    );
    expect(meta).toEqual({ ip: VERCEL_IP, userAgent: 'Next.js', requestId: null });
  });

  it("uses the visitor's address that the web server reports with the shared secret", () => {
    trustForwardedClientIp(SECRET);
    const meta = requestMeta(
      request({ [CLIENT_IP_HEADER]: '203.0.113.7', [FORWARDING_SECRET_HEADER]: SECRET }),
    );
    expect(meta.ip).toBe('203.0.113.7');
    expect(
      requestMeta(request({ [CLIENT_IP_HEADER]: '2001:db8::1', [FORWARDING_SECRET_HEADER]: SECRET })).ip,
    ).toBe('2001:db8::1');
  });

  it('ignores a reported address without the right secret, or one that is not an IP address', () => {
    trustForwardedClientIp(SECRET);
    expect(requestMeta(request({ [CLIENT_IP_HEADER]: '203.0.113.7' })).ip).toBe(VERCEL_IP);
    expect(
      requestMeta(request({ [CLIENT_IP_HEADER]: '203.0.113.7', [FORWARDING_SECRET_HEADER]: 'x'.repeat(40) }))
        .ip,
    ).toBe(VERCEL_IP);
    expect(
      requestMeta(request({ [CLIENT_IP_HEADER]: '203.0.113.7', [FORWARDING_SECRET_HEADER]: 'short' })).ip,
    ).toBe(VERCEL_IP);
    expect(
      requestMeta(
        request({ [CLIENT_IP_HEADER]: '203.0.113.7, 10.0.0.1', [FORWARDING_SECRET_HEADER]: SECRET }),
      ).ip,
    ).toBe(VERCEL_IP);
  });
});
