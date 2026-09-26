// apps/api/src/ai/anthropic.provider.ts
//
// Single Anthropic client for the whole API. When ANTHROPIC_API_KEY is not set, the provider
// yields null and every AI feature degrades to "route to human review" instead of failing.
import Anthropic from '@anthropic-ai/sdk';
import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';

export const ANTHROPIC_CLIENT = Symbol('ANTHROPIC_CLIENT');

export const anthropicClientProvider: Provider = {
  provide: ANTHROPIC_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): Anthropic | null => {
    const apiKey = config.get('ANTHROPIC_API_KEY', { infer: true });
    if (!apiKey) return null;
    return new Anthropic({
      apiKey,
      timeout: 60_000, // ms; screening must never hold a request thread for long
      maxRetries: 2, // SDK retries 408/409/429/5xx and connection errors with backoff
    });
  },
};
