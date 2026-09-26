// apps/api/src/payments/webhooks/payment.webhook.controller.ts
//
// POST /api/v1/webhooks/:provider   (provider = paymongo | xendit | stripe)
//
// Response contract, chosen so gateways behave correctly:
//   200 { received: true, duplicate: false } -> first delivery, stored and queued for processing
//   200 { received: true, duplicate: true }  -> repeat delivery, safely ignored (stops retries)
//   401                                      -> signature/token invalid (never processed)
//   404                                      -> unknown provider, or provider not configured
//   5xx                                      -> our failure; the gateway retries, and de-duplication
//                                               makes that retry safe
import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { PaymentWebhookService } from './payment-webhook.service.js';
import { WebhookSignatureError, type VerifiedWebhookEvent } from './verifiers/webhook-verifier.js';
import { WebhookVerifierRegistry } from './verifiers/webhook-verifier.registry.js';

export interface WebhookAck {
  received: true;
  duplicate: boolean;
  eventId: string;
}

@Controller('webhooks')
export class PaymentWebhookController {
  private readonly logger = new Logger(PaymentWebhookController.name);

  constructor(
    private readonly verifiers: WebhookVerifierRegistry,
    private readonly webhooks: PaymentWebhookService,
  ) {}

  @Post(':provider')
  @HttpCode(HttpStatus.OK)
  async receive(
    @Param('provider') provider: string,
    @Req() request: RawBodyRequest<FastifyRequest>,
  ): Promise<WebhookAck> {
    const verifier = this.verifiers.get(provider);

    if (!request.rawBody || request.rawBody.length === 0) {
      throw new BadRequestException('Empty webhook body');
    }

    let event: VerifiedWebhookEvent;
    try {
      event = verifier.verify({ rawBody: request.rawBody, headers: request.headers });
    } catch (error) {
      if (error instanceof WebhookSignatureError) {
        // Log the reason for operators; never echo it to the caller.
        this.logger.warn(`Rejected ${provider} webhook from ${request.ip}: ${error.message}`);
        throw new UnauthorizedException('Invalid webhook signature');
      }
      throw error;
    }

    const result = await this.webhooks.ingest(event);
    return { received: true, duplicate: result.status === 'duplicate', eventId: result.eventId };
  }
}
