// apps/api/src/payments/webhooks/verifiers/xendit.verifier.ts
//
// Xendit (e-wallets, QR, virtual accounts, payouts). Xendit authenticates callbacks with a static
// verification token in the `x-callback-token` header (compare in constant time) and sends a
// per-delivery `webhook-id` header for idempotency. There is no signed timestamp, so replay
// protection relies on the webhook-id de-duplication done in PaymentWebhookService.
// Tip: also restrict this route to Xendit's published callback IP ranges at the WAF.
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { safeEqual } from '../../../common/crypto/safe-compare.js';
import type { Env } from '../../../config/env.schema.js';
import {
  asString,
  dig,
  headerValue,
  parseJsonObject,
  WebhookSignatureError,
  type VerifiedWebhookEvent,
  type WebhookRequest,
  type WebhookVerifier,
} from './webhook-verifier.js';

@Injectable()
export class XenditWebhookVerifier implements WebhookVerifier {
  readonly provider = 'XENDIT' as const;
  readonly routeKey = 'xendit';

  constructor(private readonly config: ConfigService<Env, true>) {}

  isConfigured(): boolean {
    return Boolean(this.config.get('XENDIT_CALLBACK_TOKEN', { infer: true }));
  }

  verify(request: WebhookRequest): VerifiedWebhookEvent {
    const token = this.config.get('XENDIT_CALLBACK_TOKEN', { infer: true });
    if (!token) throw new WebhookSignatureError('Xendit callback token is not configured');

    const provided = headerValue(request.headers, 'x-callback-token');
    if (!provided || !safeEqual(provided, token)) throw new WebhookSignatureError('invalid x-callback-token');

    const payload = parseJsonObject(request.rawBody);

    // Prefer the delivery id header; otherwise derive a stable id from resource id + status so
    // repeated deliveries of the same state change still de-duplicate.
    const resourceId = asString(dig(payload, 'id')) ?? asString(dig(payload, 'data', 'id'));
    const status = asString(dig(payload, 'status')) ?? asString(dig(payload, 'data', 'status'));
    const eventId =
      asString(headerValue(request.headers, 'webhook-id')) ??
      (resourceId ? `${resourceId}:${status ?? 'callback'}` : null);
    if (!eventId) throw new WebhookSignatureError('cannot determine event id');

    const eventType = asString(dig(payload, 'event')) ?? `callback.${(status ?? 'unknown').toLowerCase()}`;
    const livemodeFlag = dig(payload, 'is_live') ?? dig(payload, 'livemode');
    const metadata = dig(payload, 'metadata') ?? dig(payload, 'data', 'metadata');
    const campaignId = asString(dig(metadata, 'campaign_id')) ?? asString(dig(metadata, 'campaignId'));

    return {
      provider: this.provider,
      eventId,
      eventType,
      livemode: livemodeFlag === true,
      payload,
      campaignId,
    };
  }
}
