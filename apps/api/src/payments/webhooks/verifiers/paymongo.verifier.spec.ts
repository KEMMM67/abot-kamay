// apps/api/src/payments/webhooks/verifiers/paymongo.verifier.spec.ts
import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.schema.js';
import { PaymongoWebhookVerifier } from './paymongo.verifier.js';
import { WebhookSignatureError } from './webhook-verifier.js';

const SECRET = 'whsk_test_abotkamay_secret';
const NOW = new Date('2026-09-25T08:00:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);

function verifierFor(nodeEnv: Env['NODE_ENV'] = 'development') {
  const config = new ConfigService<Env, true>({
    NODE_ENV: nodeEnv,
    PAYMONGO_WEBHOOK_SECRET: SECRET,
    WEBHOOK_TOLERANCE_SECONDS: 300,
  } as Partial<Env>);
  return new PaymongoWebhookVerifier(config);
}

function paymongoEvent(livemode = false) {
  return Buffer.from(
    JSON.stringify({
      data: {
        id: 'evt_9xYz',
        type: 'event',
        attributes: {
          type: 'payment.paid',
          livemode,
          data: {
            id: 'pay_123',
            type: 'payment',
            attributes: { amount: 50000, metadata: { campaign_id: 'cmp_1' } },
          },
        },
      },
    }),
  );
}

function sign(body: Buffer, timestamp = NOW_SECONDS, secret = SECRET): string {
  return createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest('hex');
}

function headers(body: Buffer, opts: { timestamp?: number; te?: string; li?: string } = {}) {
  const timestamp = opts.timestamp ?? NOW_SECONDS;
  const te = opts.te ?? sign(body, timestamp);
  return { 'paymongo-signature': `t=${timestamp},te=${te},li=${opts.li ?? ''}` };
}

describe('PaymongoWebhookVerifier', () => {
  it('verifies a correctly signed test-mode event and normalizes it', () => {
    const body = paymongoEvent();
    const event = verifierFor().verify({ rawBody: body, headers: headers(body) }, NOW);
    expect(event).toMatchObject({
      provider: 'PAYMONGO',
      eventId: 'evt_9xYz',
      eventType: 'payment.paid',
      livemode: false,
      campaignId: 'cmp_1',
    });
  });

  it('rejects a body modified after signing', () => {
    const body = paymongoEvent();
    const tampered = Buffer.from(body.toString('utf8').replace('50000', '5000000'));
    expect(() => verifierFor().verify({ rawBody: tampered, headers: headers(body) }, NOW)).toThrow(
      WebhookSignatureError,
    );
  });

  it('rejects a signature made with a different secret', () => {
    const body = paymongoEvent();
    const forged = sign(body, NOW_SECONDS, 'whsk_attacker_guess');
    expect(() =>
      verifierFor().verify({ rawBody: body, headers: headers(body, { te: forged }) }, NOW),
    ).toThrow(/signature mismatch/);
  });

  it('rejects replays outside the tolerance window', () => {
    const body = paymongoEvent();
    const old = NOW_SECONDS - 3_600;
    expect(() =>
      verifierFor().verify({ rawBody: body, headers: headers(body, { timestamp: old }) }, NOW),
    ).toThrow(/replay window/);
  });

  it('rejects test-mode events in production', () => {
    const body = paymongoEvent(false);
    expect(() => verifierFor('production').verify({ rawBody: body, headers: headers(body) }, NOW)).toThrow(
      /test-mode events are rejected/,
    );
  });

  it('uses the live-mode signature for live events', () => {
    const body = paymongoEvent(true);
    const live = sign(body);
    const event = verifierFor('production').verify(
      { rawBody: body, headers: headers(body, { te: 'not-used', li: live }) },
      NOW,
    );
    expect(event.livemode).toBe(true);
  });
});
