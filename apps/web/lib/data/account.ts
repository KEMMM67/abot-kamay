// apps/web/lib/data/account.ts
//
// The signed-in creator's own data, for the account pages (Server Components only). Like the session,
// these read the cookie and are never cached across users.
import 'server-only';
import { cache } from 'react';
import { api } from '@/lib/api';
import { getSessionToken } from '@/lib/session';
import type { MyCampaign } from '@/lib/types';
import { asVisitor } from '@/lib/visitor';

/** The creator's posts, including ones still in review; empty when signed out. */
export const getMyCampaigns = cache(async (): Promise<MyCampaign[]> => {
  const token = await getSessionToken();
  if (!token) return [];
  return api.me.campaigns(token, await asVisitor());
});

/** The signed-in user's own campaign with this slug, or null. */
export async function getOwnCampaign(slug: string): Promise<MyCampaign | null> {
  const mine = await getMyCampaigns();
  return mine.find((campaign) => campaign.slug === slug) ?? null;
}
