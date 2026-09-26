// apps/api/src/ai/ai-gateway.service.ts
//
// The only place in AbotKamay that talks to an LLM. Every call:
//   - returns schema-validated JSON (structured outputs via a Zod schema) or a typed non-result;
//   - handles refusals: server-side fallbacks retry policy declines on a fallback model, and any
//     final refusal becomes REFUSED (routed to humans), never an exception in the request path;
//   - is logged to ai_invocations (model, prompt version, outcome, latency, tokens);
//   - honors the AI_SCREENING_ENABLED kill switch.
// AI output is advisory only. It never approves campaigns, identities, merges, or money movement.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { BetaContentBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { z } from 'zod';
import type { Env } from '../config/env.schema.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ANTHROPIC_CLIENT } from './anthropic.provider.js';

export type AiFeature = 'LINK_SCREEN' | 'DUP_ADJUDICATE' | 'RECEIPT_CHECK' | 'STORY_DRAFT' | 'CLAIM_CHECK';
export type AiEffort = 'low' | 'medium' | 'high';

export interface StructuredAiRequest<TSchema extends z.ZodType> {
  feature: AiFeature;
  promptVersion: string;
  schema: TSchema;
  /** Stable policy text; cached across calls. Put nothing per-request in here. */
  system: string;
  content: BetaContentBlockParam[];
  effort: AiEffort;
  target?: { type: string; id: string };
}

export type StructuredAiResult<T> =
  | { outcome: 'PARSED'; data: T; model: string }
  | { outcome: 'REFUSED' | 'INVALID_OUTPUT' | 'ERROR' | 'DISABLED'; reason: string };

@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);
  private readonly model: string;
  private readonly enabled: boolean;

  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly client: Anthropic | null,
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.model = config.get('AI_MODEL', { infer: true });
    this.enabled = config.get('AI_SCREENING_ENABLED', { infer: true });
  }

  async runStructured<TSchema extends z.ZodType>(
    request: StructuredAiRequest<TSchema>,
  ): Promise<StructuredAiResult<z.infer<TSchema>>> {
    if (!this.client || !this.enabled) {
      const result = { outcome: 'DISABLED', reason: 'AI disabled or not configured' } as const;
      await this.record(request, result, 0);
      return result;
    }

    const startedAt = performance.now();
    let result: StructuredAiResult<z.infer<TSchema>>;
    let usage: { input: number; output: number } | undefined;
    let stopReason: string | null = null;

    try {
      const message = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: 16_000,
        // Policy declines on sensitive-but-legitimate content (injury, disability, poverty) are
        // retried server-side on Anthropic's recommended fallback model instead of failing.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: request.effort, format: betaZodOutputFormat(request.schema) },
        system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: request.content }],
      });

      stopReason = message.stop_reason;
      usage = { input: message.usage.input_tokens, output: message.usage.output_tokens };

      if (message.stop_reason === 'refusal') {
        result = { outcome: 'REFUSED', reason: 'model declined; routed to human review' };
      } else if (message.parsed_output === null || message.parsed_output === undefined) {
        result = {
          outcome: 'INVALID_OUTPUT',
          reason: `no parsable output (stop_reason=${message.stop_reason})`,
        };
      } else {
        result = { outcome: 'PARSED', data: message.parsed_output as z.infer<TSchema>, model: message.model };
      }
    } catch (error) {
      result = { outcome: 'ERROR', reason: describeAiError(error) };
      this.logger.warn(`${request.feature} AI call failed: ${result.reason}`);
    }

    await this.record(request, result, Math.round(performance.now() - startedAt), usage, stopReason);
    return result;
  }

  private async record(
    request: StructuredAiRequest<z.ZodType>,
    result: StructuredAiResult<unknown>,
    latencyMs: number,
    usage?: { input: number; output: number },
    stopReason?: string | null,
  ): Promise<void> {
    try {
      await this.prisma.aiInvocation.create({
        data: {
          feature: request.feature,
          model: this.model,
          promptVersion: request.promptVersion,
          outcome: result.outcome,
          output:
            result.outcome === 'PARSED' ? (result.data as Prisma.InputJsonValue) : { reason: result.reason },
          stopReason: stopReason ?? null,
          latencyMs,
          inputTokens: usage?.input ?? null,
          outputTokens: usage?.output ?? null,
          targetType: request.target?.type ?? null,
          targetId: request.target?.id ?? null,
        },
      });
    } catch (error) {
      // Audit logging must never break the product flow; alert on this log line instead.
      this.logger.error(`Failed to record AI invocation: ${describeAiError(error)}`);
    }
  }
}

function describeAiError(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError) return 'rate limited (429)';
  if (error instanceof Anthropic.APIConnectionError) return 'connection error';
  if (error instanceof Anthropic.APIError) return `API error ${error.status ?? ''} ${error.name}`.trim();
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return 'unknown error';
}
