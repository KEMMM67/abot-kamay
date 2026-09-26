// apps/web/next.config.ts
//
// Next.js configuration for the AbotKamay web app.
//
// - Pages live under app/[lang] (Filipino and English); proxy.ts rewrites every public URL to the
//   visitor's language. The rewrites below are the same map for the default language: they give
//   typed routes the public URLs (/campaigns/{slug}, not /fil/campaigns/{slug}), and they serve
//   Filipino if a request ever skips the proxy.
// - /c/:slug is the official short link that creators pin and campaign QR codes print. It redirects
//   to the canonical campaign page. The Selenium suite also opens campaigns through it.
// - Baseline security headers, plus a Content Security Policy without nonces. When checkout lands,
//   payment pages move to a nonce-based CSP in proxy.ts (TECHNICAL_PLAN.md, section 5.7).
// - connect-src allows the API origin (the checker and the donation dialog call it from the browser)
//   and the storage origins that creators upload to directly with presigned URLs.
// - img-src and media-src allow the media CDN (moderated post photos, videos and video posters) and
//   blob: for the local previews in the post, ID and receipt forms.
// - The monorepo installs dependencies at the repository root, so output tracing starts there (Vercel
//   bundles each function with the node_modules it traced).
import path from 'node:path';
import type { NextConfig } from 'next';
import { DEFAULT_LOCALE } from './lib/i18n/config';

const isDev = process.env.NODE_ENV === 'development';
const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1').origin;

/** Origins of a space- or comma-separated list of URLs; invalid entries are ignored. */
function origins(value: string | undefined): string[] {
  return (value ?? '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .flatMap((entry) => {
      try {
        return [new URL(entry).origin];
      } catch {
        return [];
      }
    });
}

const mediaOrigins = origins(process.env.NEXT_PUBLIC_MEDIA_BASE_URL);
const uploadOrigins = origins(process.env.NEXT_PUBLIC_UPLOAD_ORIGINS);

/**
 * A production deployment without these would build fine and then fail for every donor: pages
 * calling localhost, media blocked by the CSP, uploads refused. Fail the Vercel build instead.
 */
function checkDeploymentEnv(): void {
  const target = process.env.VERCEL_ENV;
  if (target !== 'production' && target !== 'preview') return;
  const problems: string[] = [];
  const api = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
  if (!/^https:\/\/.+\/api\/v1\/?$/.test(api)) {
    problems.push('NEXT_PUBLIC_API_BASE_URL must be the https API URL ending in /api/v1');
  }
  if (mediaOrigins.length === 0) problems.push('NEXT_PUBLIC_MEDIA_BASE_URL (the media CDN) is not set');
  if (uploadOrigins.length === 0) problems.push('NEXT_PUBLIC_UPLOAD_ORIGINS (storage origins) is not set');
  if ((process.env.FORWARDED_IP_SECRET ?? '').length < 32) {
    problems.push(
      'FORWARDED_IP_SECRET (the same value as on the API) is not set or shorter than 32 characters',
    );
  }
  if (problems.length === 0) return;
  const message = `AbotKamay web configuration (see DEPLOYMENT.md):\n  - ${problems.join('\n  - ')}`;
  if (target === 'production') throw new Error(message);
  console.warn(message);
}

checkDeploymentEnv();

/** Public page URLs. Keep in step with the folders under app/[lang]. */
const PUBLIC_PAGES = [
  '/',
  '/campaigns',
  '/campaigns/:slug',
  '/campaigns/:slug/ledger',
  '/campaigns/:slug/mag-ulat',
  '/mag-post',
  '/mag-sign-in',
  '/ako',
  '/verify',
] as const;

const contentSecurityPolicy = [
  "default-src 'self'",
  // React needs eval in development only, to rebuild server error stacks in the browser.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  ['img-src', "'self'", 'blob:', 'data:', ...mediaOrigins].join(' '),
  ['media-src', "'self'", 'blob:', ...mediaOrigins].join(' '),
  "font-src 'self'",
  ['connect-src', "'self'", apiOrigin, ...uploadOrigins, ...(isDev ? ['ws:', 'wss:'] : [])].join(' '),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Only when the API is served over HTTPS; upgrading http://localhost calls would break local runs.
  ...(apiOrigin.startsWith('https:') ? ['upgrade-insecure-requests'] : []),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  // The ID and receipt forms open the camera through <input capture>, which needs no permission here.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
  ...(isDev
    ? []
    : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  images: {
    // Post photos and video posters come only from the moderated media CDN.
    remotePatterns: mediaOrigins.map((origin) => {
      const url = new URL(origin);
      return {
        protocol: url.protocol.replace(':', '') as 'http' | 'https',
        hostname: url.hostname,
        port: url.port,
      };
    }),
  },
  async redirects() {
    return [{ source: '/c/:slug', destination: '/campaigns/:slug', permanent: false }];
  },
  async rewrites() {
    return PUBLIC_PAGES.map((source) => ({
      source,
      destination: `/${DEFAULT_LOCALE}${source === '/' ? '' : source}`,
    }));
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
