// apps/web/proxy.ts
//
// Language routing (Next.js 16 Proxy, formerly Middleware). Every page lives under app/[lang], but no
// public URL carries the language: /campaigns/lolo-ben is the same link for every donor, and each
// visitor sees it in the language they chose.
//
//   GET /campaigns?lang=en  -> remember English (ak_lang cookie), 307 to /campaigns
//   GET /en/campaigns       -> the same, for links typed or shared with a prefix
//   GET /campaigns          -> rewritten inside the server to /fil/campaigns or /en/campaigns
//
// Rewrites keep static and ISR caching intact: /fil/campaigns and /en/campaigns are cached as two
// pages, and the cookie only picks which one a request is served. Server Actions POST to the same
// URLs and are rewritten the same way.
import { NextResponse, type NextRequest } from 'next/server';
import {
  isLocale,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  LOCALE_QUERY_PARAM,
  LOCALES,
  localeFrom,
  type Locale,
} from '@/lib/i18n/config';

function remember(response: NextResponse, request: NextRequest, locale: Locale): NextResponse {
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
    sameSite: 'lax',
    httpOnly: true,
    // Plain http only on a developer's machine; production is always https.
    secure: request.nextUrl.protocol === 'https:',
  });
  // A redirect that sets a cookie must never be stored by a shared cache.
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export function proxy(request: NextRequest): NextResponse {
  const { nextUrl } = request;

  const requested = nextUrl.searchParams.get(LOCALE_QUERY_PARAM);
  if (requested !== null) {
    const clean = nextUrl.clone();
    clean.searchParams.delete(LOCALE_QUERY_PARAM);
    const response = NextResponse.redirect(clean);
    // An unknown value (?lang=xx) just drops the parameter and keeps the current language.
    return isLocale(requested) ? remember(response, request, requested) : response;
  }

  const prefixed = LOCALES.find(
    (locale) => nextUrl.pathname === `/${locale}` || nextUrl.pathname.startsWith(`/${locale}/`),
  );
  if (prefixed) {
    const clean = nextUrl.clone();
    clean.pathname = nextUrl.pathname.slice(prefixed.length + 1) || '/';
    return remember(NextResponse.redirect(clean), request, prefixed);
  }

  const locale = localeFrom(request.cookies.get(LOCALE_COOKIE)?.value);
  const target = nextUrl.clone();
  target.pathname = `/${locale}${nextUrl.pathname === '/' ? '' : nextUrl.pathname}`;
  return NextResponse.rewrite(target);
}

export const config = {
  matcher: [
    // Pages and Server Actions only: not build assets, image optimization, or files with an
    // extension (/icon.svg, /robots.txt). Campaign slugs never contain a dot.
    '/((?!_next/static|_next/image|_next/webpack-hmr|.*\\..*).*)',
  ],
};
