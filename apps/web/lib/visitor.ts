// apps/web/lib/visitor.ts
//
// Server Actions and the account pages call the API from this server, so without help the API would
// see this server's address for every visitor: one shared per-IP sign-in limit for the whole country,
// and audit records full of Vercel's address. asVisitor() reports the visitor's own address, with the
// FORWARDED_IP_SECRET the API checks before believing it (apps/api/src/common/http/request-meta.ts).
//
// Vercel sets x-real-ip and x-forwarded-for itself and overwrites whatever the browser sent. Anywhere
// else, run the site behind a proxy that does the same. Only per-visitor, uncached calls use this;
// cached public reads are identical for everyone and must not vary by visitor.
import 'server-only';
import { headers } from 'next/headers';
import type { RequestOptions } from '@/lib/api';

export async function asVisitor(): Promise<RequestOptions> {
  const secret = process.env.FORWARDED_IP_SECRET;
  if (!secret) return {};
  const incoming = await headers();
  const address = incoming.get('x-real-ip') ?? incoming.get('x-forwarded-for')?.split(',')[0];
  const ip = address?.trim();
  if (!ip) return {};
  return { headers: { 'X-AbotKamay-Client-IP': ip, 'X-AbotKamay-Forwarding-Secret': secret } };
}
