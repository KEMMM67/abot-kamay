// apps/api/src/payments/webhooks/verifiers/webhook-verifier.ts
//
// Contract every payment gateway adapter implements. A verifier turns raw HTTP input into a
// normalized, AUTHENTICATED event, or throws WebhookSignatureError. Nothing downstream ever sees
// an unverified payload.
import type { PaymentProvider } from '../../../generated/prisma/enums.js';

export type HeaderBag = Record<string, string | string[] | undefined>;

export interface WebhookRequest {
  rawBody: Buffer;
  headers: HeaderBag;
}

export interface VerifiedWebhookEvent {
  provider: PaymentProvider;
  /** Provider's unique id for this delivery/event: the de-duplication key. */
  eventId: string;
  eventType: string;
  livemode: boolean;
  payload: Record<string, unknown>;
  /** Used as the SQS FIFO message group so one campaign's money events stay ordered. */
  campaignId: string | null;
}

export interface WebhookVerifier {
  readonly provider: PaymentProvider;
  /** Route segment: /api/v1/webhooks/:routeKey */
  readonly routeKey: string;
  isConfigured(): boolean;
  verify(request: WebhookRequest, now?: Date): VerifiedWebhookEvent;
}

export class WebhookSignatureError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'WebhookSignatureError';
  }
}

export function headerValue(headers: HeaderBag, name: string): string | undefined {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export function parseJsonObject(rawBody: Buffer): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new WebhookSignatureError('payload is not valid JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new WebhookSignatureError('payload must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

/** Safe nested lookup for untyped provider payloads: dig(obj, 'data', 'attributes', 'type'). */
export function dig(source: unknown, ...path: string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
