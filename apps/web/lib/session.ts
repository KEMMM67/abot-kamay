// apps/web/lib/session.ts
//
// The signed-in user, for Server Components and Server Actions only.
//
// The API's session token is kept in an HttpOnly, SameSite=Lax cookie on this site's own origin.
// Browser JavaScript can never read it; server code forwards it to the API as a Bearer token. Reading
// the cookie makes a route dynamic, so only the account pages (/mag-post, /ako, /mag-sign-in and the
// receipt form) call this. The public feed and campaign pages stay cached and identical for everyone.
import 'server-only';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { api, isApiError } from '@/lib/api';
import type { Viewer } from '@/lib/types';
import { asVisitor } from '@/lib/visitor';

export const SESSION_COOKIE = 'ak_session';

export async function getSessionToken(): Promise<string | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return value && value.length <= 200 ? value : null;
}

/** The signed-in user, or null. De-duplicated per render, so a layout and its page share one call. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const token = await getSessionToken();
  if (!token) return null;
  try {
    return await api.me.get(token, await asVisitor());
  } catch (error) {
    // Expired or revoked on the server: treat as signed out. Anything else is a real failure.
    if (isApiError(error) && error.code === 'UNAUTHORIZED') return null;
    throw error;
  }
});

/** Server Actions only (cookies can't be set while a page is rendering). */
export async function setSessionCookie(token: string, expiresAt: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Only same-site paths are followed after sign-in, so ?next= can't send people to another site. */
export function safeNextPath(next: unknown, fallback: Route = '/ako'): Route {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return fallback;
  }
  // Checked against an allowlist of real routes, so treating it as a typed route is sound.
  return /^\/(mag-post|ako|campaigns\/[a-z0-9-]+\/mag-ulat)(\/|$|\?)/.test(next) ? (next as Route) : fallback;
}
