// apps/web/lib/data/channels.ts
//
// "Is this legit?" lookups from the browser. Safe to import in Client Components.
import { api, isApiError } from '@/lib/api';
import type { ChannelCheckResult } from '@/lib/types';

/**
 * Checks a normalized (+63) mobile number against verified payout channels and scam reports. Resolves
 * to 'UNAVAILABLE' when the API has no checker (it answers 404 until POST /channels/check exists), so
 * the page can say so instead of "not found".
 */
export async function checkEwalletNumber(
  e164: string,
  signal?: AbortSignal,
): Promise<ChannelCheckResult | 'UNAVAILABLE'> {
  try {
    return await api.channels.check({ kind: 'EWALLET_NUMBER', value: e164 }, { signal });
  } catch (error) {
    if (isApiError(error) && error.code === 'NOT_FOUND') return 'UNAVAILABLE';
    throw error;
  }
}
