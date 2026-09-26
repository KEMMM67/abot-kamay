// apps/api/src/payments/webhooks/payment-webhook.service.ts
//
// Duplicate-safe intake of payment gateway webhooks.
//
// Gateways deliver "at least once": the same event can arrive 2, 5, or 20 times (retries after
// timeouts, network blips, manual resends). AbotKamay makes every repeat harmless:
//
//   1. INSERT ... ON CONFLICT DO NOTHING on UNIQUE(provider, provider_event_id)
//      (Prisma: createMany + skipDuplicates). The database decides atomically who is first, so two
//      concurrent deliveries of the same event cannot both win. Unlike catching a unique-violation
//      error, ON CONFLICT does not abort the surrounding transaction.
//   2. Only the first delivery writes an outbox row (same transaction) that hands the event to the
//      asynchronous processor. Repeats write nothing and return 200, so the gateway stops retrying.
//   3. Downstream effects are idempotent too (ledger idempotency keys, processed_messages), so even
//      a replay tool that bypasses this intake cannot double-post money.
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { VerifiedWebhookEvent } from './verifiers/webhook-verifier.js';

export const WEBHOOK_RECEIVED_EVENT = 'payments.webhook.received';

export interface WebhookIngestResult {
  status: 'accepted' | 'duplicate';
  eventId: string;
}

@Injectable()
export class PaymentWebhookService {
  private readonly logger = new Logger(PaymentWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ingest(event: VerifiedWebhookEvent): Promise<WebhookIngestResult> {
    const result = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.paymentWebhookEvent.createMany({
        data: [
          {
            provider: event.provider,
            providerEventId: event.eventId,
            eventType: event.eventType,
            livemode: event.livemode,
            payload: event.payload as Prisma.InputJsonObject,
            signatureValid: true,
          },
        ],
        skipDuplicates: true,
      });

      if (count === 0) {
        return { status: 'duplicate', eventId: event.eventId } as const;
      }

      await tx.outboxEvent.create({
        data: {
          aggregateType: 'payment_webhook_event',
          aggregateId: `${event.provider}:${event.eventId}`,
          eventType: WEBHOOK_RECEIVED_EVENT,
          payload: {
            provider: event.provider,
            providerEventId: event.eventId,
            eventType: event.eventType,
            livemode: event.livemode,
          },
          // FIFO ordering per campaign; provider-wide group when the event has no campaign.
          messageGroup: event.campaignId ?? `payments:${event.provider}`,
        },
      });
      return { status: 'accepted', eventId: event.eventId } as const;
    });

    if (result.status === 'duplicate') {
      this.logger.log(`Ignored duplicate ${event.provider} webhook ${event.eventId} (${event.eventType})`);
    } else {
      this.logger.log(`Accepted ${event.provider} webhook ${event.eventId} (${event.eventType})`);
    }
    return result;
  }
}
