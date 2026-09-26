// apps/api/src/payments/webhooks/verifiers/stripe.verifier.ts
//
// Stripe (international cards and wallets). Uses the official verifier, which checks the
// Stripe-Signature header (HMAC-SHA256, v1 scheme) and the timestamp tolerance.
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { Env } from '../../../config/env.schema.js';
import {
  asString,
  dig,
  headerValue,
  WebhookSignatureError,
  type VerifiedWebhookEvent,
  type WebhookRequest,
  type WebhookVerifier,
} from './webhook-verifier.js';

@Injectable()
export class StripeWebhookVerifier implements WebhookVerifier {
  readonly provider = 'STRIPE' as const;
  readonly routeKey = 'stripe';

  constructor(private readonly config: ConfigService<Env, true>) {}

  isConfigured(): boolean {
    return Boolean(this.config.get('STRIPE_WEBHOOK_SECRET', { infer: true }));
  }

  verify(request: WebhookRequest): VerifiedWebhookEvent {
    const secret = this.config.get('STRIPE_WEBHOOK_SECRET', { infer: true });
    if (!secret) throw new WebhookSignatureError('Stripe webhook secret is not configured');

    const signature = headerValue(request.headers, 'stripe-signature');
    if (!signature) throw new WebhookSignatureError('missing Stripe-Signature header');

    let event: ReturnType<typeof Stripe.webhooks.constructEvent>;
    try {
      event = Stripe.webhooks.constructEvent(
        request.rawBody,
        signature,
        secret,
        this.config.get('WEBHOOK_TOLERANCE_SECONDS', { infer: true }),
      );
    } catch (error) {
      throw new WebhookSignatureError(
        error instanceof Error ? error.message : 'signature verification failed',
      );
    }

    if (!event.livemode && this.config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new WebhookSignatureError('test-mode events are rejected in production');
    }

    const payload = JSON.parse(request.rawBody.toString('utf8')) as Record<string, unknown>;
    const metadata = dig(payload, 'data', 'object', 'metadata');

    return {
      provider: this.provider,
      eventId: event.id,
      eventType: event.type,
      livemode: event.livemode,
      payload,
      campaignId: asString(dig(metadata, 'campaignId')) ?? asString(dig(metadata, 'campaign_id')),
    };
  }
}
