// apps/web/lib/data/campaigns.ts
//
// Campaign reads for Server Components, straight from the AbotKamay API. React cache() de-duplicates
// calls within one render: generateMetadata and the page both ask for the same campaign, and the API
// is called once. Campaign pages ask for the API-written text (timeline, checks) in the page's
// language; the language comes from the [lang] root segment.
//
// Failure policy: these functions throw when the API fails. On a production server that is what keeps
// a campaign up during an outage: a failed background refresh leaves the last good page in the cache.
import 'server-only';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import { cache } from 'react';
import { api, isApiError } from '@/lib/api';
import { getLocale } from '@/lib/i18n/server';
import type { CampaignDetail, CampaignSummary, Page, PublicLedgerEntry, SpendingReport } from '@/lib/types';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Rejects malformed slugs before they reach the API. */
export function isValidSlug(slug: string): boolean {
  return slug.length <= 120 && SLUG_PATTERN.test(slug);
}

/**
 * For the static pages that list campaigns (home, /campaigns). While building, or in development, an
 * API failure resolves to null so the page renders a friendly notice and the build still succeeds. On
 * a production server it rethrows: Next.js then keeps serving the last good copy of the page instead of
 * caching the notice over it, and retries on the next request.
 */
export async function nullWhileBuilding<T>(work: Promise<T>, label: string): Promise<T | null> {
  try {
    return await work;
  } catch (error) {
    const building = process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;
    if (process.env.NODE_ENV === 'production' && !building) throw error;
    console.error(`[${label}] Campaigns unavailable, rendering a notice instead.`, error);
    return null;
  }
}

export const listCampaigns = cache(async (): Promise<CampaignSummary[]> => {
  const page = await api.campaigns.list({ limit: 24 });
  return page.items;
});

/** Campaigns for the landing page: active ones only, in the API's order. */
export const getFeaturedCampaigns = cache(async (count: number): Promise<CampaignSummary[]> => {
  const campaigns = await listCampaigns();
  return campaigns.filter((campaign) => campaign.status === 'ACTIVE').slice(0, count);
});

/** The campaign, or null when it doesn't exist (the page then renders its 404). */
export const getCampaign = cache(async (slug: string): Promise<CampaignDetail | null> => {
  if (!isValidSlug(slug)) return null;
  try {
    return await api.campaigns.get(slug, await getLocale());
  } catch (error) {
    if (isApiError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  }
});

export const getCampaignLedger = cache(
  async (slug: string, cursor?: string): Promise<Page<PublicLedgerEntry> | null> => {
    if (!isValidSlug(slug)) return null;
    try {
      return await api.campaigns.ledger(slug, { cursor, limit: 25 });
    } catch (error) {
      if (isApiError(error) && error.code === 'NOT_FOUND') return null;
      throw error;
    }
  },
);

/** The creator's receipts and proof of spending, newest first. */
export const getSpendingReports = cache(
  async (slug: string, cursor?: string): Promise<Page<SpendingReport> | null> => {
    if (!isValidSlug(slug)) return null;
    try {
      return await api.campaigns.spendingReports(slug, { cursor, limit: 20 });
    } catch (error) {
      if (isApiError(error) && error.code === 'NOT_FOUND') return null;
      throw error;
    }
  },
);
