// apps/api/src/payments/webhooks/verifiers/webhook-verifier.registry.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymongoWebhookVerifier } from './paymongo.verifier.js';
import { StripeWebhookVerifier } from './stripe.verifier.js';
import type { WebhookVerifier } from './webhook-verifier.js';
import { XenditWebhookVerifier } from './xendit.verifier.js';

@Injectable()
export class WebhookVerifierRegistry {
  private readonly verifiers: ReadonlyMap<string, WebhookVerifier>;

  constructor(
    paymongo: PaymongoWebhookVerifier,
    xendit: XenditWebhookVerifier,
    stripe: StripeWebhookVerifier,
  ) {
    this.verifiers = new Map<string, WebhookVerifier>(
      [paymongo, xendit, stripe].map((verifier) => [verifier.routeKey, verifier]),
    );
  }

  /** Unknown providers and providers without configured secrets are indistinguishable: 404. */
  get(routeKey: string): WebhookVerifier {
    const verifier = this.verifiers.get(routeKey.toLowerCase());
    if (!verifier || !verifier.isConfigured()) {
      throw new NotFoundException();
    }
    return verifier;
  }
}
