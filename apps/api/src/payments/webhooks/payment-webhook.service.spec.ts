// apps/api/src/payments/webhooks/payment-webhook.service.spec.ts
import type { PrismaService } from '../../prisma/prisma.service.js';
import { PaymentWebhookService, WEBHOOK_RECEIVED_EVENT } from './payment-webhook.service.js';
import type { VerifiedWebhookEvent } from './verifiers/webhook-verifier.js';

function makePrisma(insertedCounts: number[]) {
  const tx = {
    paymentWebhookEvent: { createMany: vi.fn() },
    outboxEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  for (const count of insertedCounts) {
    tx.paymentWebhookEvent.createMany.mockResolvedValueOnce({ count });
  }
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  return { prisma: prisma as unknown as PrismaService, tx };
}

const event: VerifiedWebhookEvent = {
  provider: 'PAYMONGO',
  eventId: 'evt_abotkamay_001',
  eventType: 'payment.paid',
  livemode: false,
  payload: { data: { id: 'evt_abotkamay_001' } },
  campaignId: 'campaign-lolo-ben',
};

describe('PaymentWebhookService.ingest', () => {
  it('accepts the first delivery and writes exactly one outbox event', async () => {
    const { prisma, tx } = makePrisma([1]);
    const result = await new PaymentWebhookService(prisma).ingest(event);

    expect(result).toEqual({ status: 'accepted', eventId: 'evt_abotkamay_001' });
    expect(tx.paymentWebhookEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(tx.outboxEvent.create).toHaveBeenCalledTimes(1);
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: WEBHOOK_RECEIVED_EVENT, messageGroup: 'campaign-lolo-ben' }),
    });
  });

  it('ignores a repeated delivery without side effects', async () => {
    const { prisma, tx } = makePrisma([1, 0, 0]);
    const service = new PaymentWebhookService(prisma);

    const results = [await service.ingest(event), await service.ingest(event), await service.ingest(event)];

    expect(results.map((r) => r.status)).toEqual(['accepted', 'duplicate', 'duplicate']);
    expect(tx.outboxEvent.create).toHaveBeenCalledTimes(1);
  });

  it('groups campaign-less events by provider', async () => {
    const { prisma, tx } = makePrisma([1]);
    await new PaymentWebhookService(prisma).ingest({ ...event, campaignId: null });
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ messageGroup: 'payments:PAYMONGO' }),
    });
  });
});
