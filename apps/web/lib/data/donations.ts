// apps/web/lib/data/donations.ts
//
// Starting a donation from the browser. The server decides the final amount, fees and campaign
// state; the browser only proposes. Card and e-wallet details are entered on the payment provider's
// hosted page, never on AbotKamay (PCI scope stays minimal).
import { api, ApiError, isApiError } from '@/lib/api';
import type { CreateDonationRequest } from '@/lib/types';

export type StartedDonation = { kind: 'redirect'; checkoutUrl: string } | { kind: 'unavailable' };

/**
 * Creates the checkout. Pass the same idempotencyKey when retrying the same attempt (double click,
 * flaky network), so the donor is never charged twice. Resolves to 'unavailable' when the API does not
 * take online donations for this campaign (it answers 404 until POST /campaigns/{id}/donations exists).
 */
export async function startDonation(
  campaignId: string,
  request: CreateDonationRequest,
  idempotencyKey: string,
): Promise<StartedDonation> {
  try {
    const response = await api.campaigns.createDonation(campaignId, request, { idempotencyKey });
    return { kind: 'redirect', checkoutUrl: safeCheckoutUrl(response.checkoutUrl, campaignId) };
  } catch (error) {
    if (isApiError(error) && error.code === 'NOT_FOUND') return { kind: 'unavailable' };
    throw error;
  }
}

/** Only follow https checkout links (plain http is allowed for a local sandbox during development). */
function safeCheckoutUrl(raw: string, campaignId: string): string {
  const reject = () =>
    new ApiError({
      code: 'INVALID_RESPONSE',
      message: `Refusing to redirect to checkout URL "${raw}"`,
      method: 'POST',
      url: `/campaigns/${campaignId}/donations`,
      requestId: 'n/a',
    });
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw reject();
  }
  const isLocalSandbox =
    process.env.NODE_ENV === 'development' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol === 'https:' || (isLocalSandbox && url.protocol === 'http:')) return url.toString();
  throw reject();
}
