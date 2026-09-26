// apps/api/src/auth/sms/sms-sender.ts
//
// Outbound SMS for sign-in codes. Production needs a real gateway adapter (a local aggregator or
// Twilio, TECHNICAL_PLAN.md 2.9); until one is configured, SMS_PROVIDER=none makes sign-in answer 503
// instead of pretending to send. SMS_PROVIDER=log is for development and test only (validateEnv
// refuses it in staging and production) because it writes codes to the log.
import { Logger, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { maskPhone } from '../otp.js';

export interface SmsSender {
  send(toE164: string, message: string): Promise<void>;
}

export const SMS_SENDER = Symbol('SMS_SENDER');

export class LogSmsSender implements SmsSender {
  private readonly logger = new Logger('SmsLog');

  async send(toE164: string, message: string): Promise<void> {
    this.logger.warn(`[development SMS to ${maskPhone(toE164)}] ${message}`);
  }
}

export const smsSenderProvider: Provider = {
  provide: SMS_SENDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): SmsSender | null =>
    config.get('SMS_PROVIDER', { infer: true }) === 'log' ? new LogSmsSender() : null,
};
