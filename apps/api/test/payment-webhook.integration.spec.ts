// apps/api/test/payment-webhook.integration.spec.ts
//
// Duplicate deliveries of the same gateway event, including concurrent ones, must produce exactly
// one stored event and exactly one outbox message.
import { PaymentWebhookService } from '../src/payments/webhooks/payment-webhook.service.js';
import type { VerifiedWebhookEvent } from '../src/payments/webhooks/verifiers/webhook-verifier.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestPrisma, RUN_ID } from './support/test-database.js';

let prisma: PrismaService;

beforeAll(async () => {
  prisma = createTestPrisma();
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

it('stores a repeatedly delivered event exactly once, even when deliveries race', async () => {
  const service = new PaymentWebhookService(prisma);
  const event: VerifiedWebhookEvent = {
    provider: 'PAYMONGO',
    eventId: `evt_${RUN_ID}`,
    eventType: 'payment.paid',
    livemode: false,
    payload: { data: { id: `evt_${RUN_ID}` } },
    campaignId: `cmp_${RUN_ID}`,
  };

  const results = await Promise.all(Array.from({ length: 5 }, () => service.ingest(event)));

  expect(results.filter((r) => r.status === 'accepted')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'duplicate')).toHaveLength(4);
  expect(
    await prisma.paymentWebhookEvent.count({
      where: { provider: 'PAYMONGO', providerEventId: event.eventId },
    }),
  ).toBe(1);
  expect(await prisma.outboxEvent.count({ where: { aggregateId: `PAYMONGO:${event.eventId}` } })).toBe(1);
});
