// apps/api/src/payments/webhooks/verifiers/paymongo.verifier.ts
//
// PayMongo (GCash, Maya, cards, QR Ph). Signature header:
//   Paymongo-Signature: t=<unix seconds>,te=<test-mode hmac>,li=<live-mode hmac>
// HMAC-SHA256 over `${t}.${rawBody}` using the webhook secret key; compare with `te` for test-mode
// events and `li` for live-mode events. Event envelope:
//   { data: { id: "evt_...", attributes: { type: "payment.paid", livemode, data: { ...resource } } } }
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hmacSha256Hex, safeEqual } from '../../../common/crypto/safe-compare.js';
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
export class PaymongoWebhookVerifier implements WebhookVerifier {
  readonly provider = 'PAYMONGO' as const;
  readonly routeKey = 'paymongo';

  constructor(private readonly config: ConfigService<Env, true>) {}

  isConfigured(): boolean {
    return Boolean(this.config.get('PAYMONGO_WEBHOOK_SECRET', { infer: true }));
  }

  verify(request: WebhookRequest, now: Date = new Date()): VerifiedWebhookEvent {
    const secret = this.config.get('PAYMONGO_WEBHOOK_SECRET', { infer: true });
    if (!secret) throw new WebhookSignatureError('PayMongo webhook secret is not configured');

    const header = headerValue(request.headers, 'paymongo-signature');
    if (!header) throw new WebhookSignatureError('missing Paymongo-Signature header');

    const parts = new Map(
      header.split(',').map((part) => {
        const [key, ...rest] = part.trim().split('=');
        return [key ?? '', rest.join('=')] as const;
      }),
    );
    const timestamp = Number(parts.get('t'));
    if (!Number.isInteger(timestamp)) throw new WebhookSignatureError('malformed signature timestamp');

    const toleranceSeconds = this.config.get('WEBHOOK_TOLERANCE_SECONDS', { infer: true });
    if (Math.abs(Math.floor(now.getTime() / 1000) - timestamp) > toleranceSeconds) {
      throw new WebhookSignatureError('signature timestamp outside the replay window');
    }

    const payload = parseJsonObject(request.rawBody);
    const livemode = dig(payload, 'data', 'attributes', 'livemode') === true;
    if (livemode === false && this.config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new WebhookSignatureError('test-mode events are rejected in production');
    }

    const provided = parts.get(livemode ? 'li' : 'te');
    if (!provided) throw new WebhookSignatureError('missing signature for this mode');

    const expected = hmacSha256Hex(secret, Buffer.concat([Buffer.from(`${timestamp}.`), request.rawBody]));
    if (!safeEqual(expected, provided)) throw new WebhookSignatureError('signature mismatch');

    const eventId = asString(dig(payload, 'data', 'id'));
    const eventType = asString(dig(payload, 'data', 'attributes', 'type'));
    if (!eventId || !eventType) throw new WebhookSignatureError('event id or type missing');

    const metadata = dig(payload, 'data', 'attributes', 'data', 'attributes', 'metadata');
    const campaignId = asString(dig(metadata, 'campaign_id')) ?? asString(dig(metadata, 'campaignId'));

    return { provider: this.provider, eventId, eventType, livemode, payload, campaignId };
  }
}
