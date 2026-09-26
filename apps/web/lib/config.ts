// apps/web/lib/config.ts
//
// Settings shared by server and browser code. Only NEXT_PUBLIC_* variables reach the browser, and
// Next.js inlines them at build time (see .env.example). There is no sample-data mode: every page
// reads the AbotKamay API.

const withoutTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

/** AbotKamay API base URL, including the version prefix (apps/api sets the /api/v1 prefix). */
export const API_BASE_URL = withoutTrailingSlash(
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1',
);

/**
 * Public origin of this site, for canonical URLs, official short links and Open Graph tags. On Vercel
 * it falls back to the project's production domain (a system variable Vercel exposes to the build),
 * so a deployment never prints localhost links even if NEXT_PUBLIC_SITE_URL was forgotten.
 */
export const SITE_URL = withoutTrailingSlash(
  process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}`
      : 'http://localhost:3000'),
);

/** Host and path of the official short link for a campaign, e.g. "abotkamay.ph/c/lolo-ben". */
export function officialShortLink(slug: string): { url: string; display: string } {
  const url = `${SITE_URL}/c/${slug}`;
  return { url, display: url.replace(/^https?:\/\//, '') };
}
