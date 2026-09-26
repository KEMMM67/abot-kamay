// apps/api/src/payments/payments.module.ts
import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { PaymentWebhookController } from './webhooks/payment.webhook.controller.js';
import { PaymentWebhookService } from './webhooks/payment-webhook.service.js';
import { PaymongoWebhookVerifier } from './webhooks/verifiers/paymongo.verifier.js';
import { StripeWebhookVerifier } from './webhooks/verifiers/stripe.verifier.js';
import { WebhookVerifierRegistry } from './webhooks/verifiers/webhook-verifier.registry.js';
import { XenditWebhookVerifier } from './webhooks/verifiers/xendit.verifier.js';

@Module({
  imports: [LedgerModule],
  controllers: [PaymentWebhookController],
  providers: [
    PaymongoWebhookVerifier,
    XenditWebhookVerifier,
    StripeWebhookVerifier,
    WebhookVerifierRegistry,
    PaymentWebhookService,
  ],
  exports: [PaymentWebhookService],
})
export class PaymentsModule {}
