// apps/api/src/ai/screening/screening.service.ts
//
// Screens a newly submitted viral post and produces a RECOMMENDATION for the human triage queue.
// Every outcome, including AI failure, lands in front of a human; AI only orders the queue.
import type { BetaContentBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { Injectable } from '@nestjs/common';
import { AiGatewayService } from '../ai-gateway.service.js';
import { redactPii, type RedactionFinding } from '../redaction.js';
import { SCREENING_PROMPT_VERSION, SCREENING_SYSTEM_PROMPT } from './screening.prompt.js';
import { ScreeningResultSchema, URGENCY_TO_SCORE, type ScreeningResult } from './screening.schema.js';

export interface ScreenSubmissionInput {
  submissionId: string;
  caption: string;
  submitterNotes: string;
  /** Optional TikTok oEmbed thumbnail, JPEG, base64 (no data: prefix). */
  thumbnailJpegBase64?: string;
}

export type TriageRecommendation = 'TRIAGE_PRIORITY' | 'TRIAGE' | 'TRIAGE_LIKELY_OUT_OF_SCOPE';

export interface ScreeningOutcome {
  recommendation: TriageRecommendation;
  urgencyScore: 0 | 1 | 2 | 3;
  ai: ScreeningResult | null;
  aiOutcome: 'PARSED' | 'REFUSED' | 'INVALID_OUTPUT' | 'ERROR' | 'DISABLED';
  /** Hashes of redacted payment/contact details, checked against the payment-channel registry. */
  redactions: RedactionFinding[];
}

@Injectable()
export class ScreeningService {
  constructor(private readonly gateway: AiGatewayService) {}

  async screenSubmission(input: ScreenSubmissionInput): Promise<ScreeningOutcome> {
    const caption = redactPii(input.caption);
    const notes = redactPii(input.submitterNotes);
    const redactions = [...caption.findings, ...notes.findings];

    const content: BetaContentBlockParam[] = [];
    if (input.thumbnailJpegBase64) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: input.thumbnailJpegBase64 },
      });
    }
    content.push({
      type: 'text',
      text:
        `<untrusted_post_caption>\n${caption.text}\n</untrusted_post_caption>\n` +
        `<untrusted_submitter_notes>\n${notes.text}\n</untrusted_submitter_notes>`,
    });

    const result = await this.gateway.runStructured({
      feature: 'LINK_SCREEN',
      promptVersion: SCREENING_PROMPT_VERSION,
      schema: ScreeningResultSchema,
      system: SCREENING_SYSTEM_PROMPT,
      content,
      effort: 'low', // high-volume classification; raise only if evals show a quality gap
      target: { type: 'submission', id: input.submissionId },
    });

    if (result.outcome !== 'PARSED') {
      // Fail safe: no AI opinion means a normal-priority human review, never an automatic decision.
      return { recommendation: 'TRIAGE', urgencyScore: 0, ai: null, aiOutcome: result.outcome, redactions };
    }

    const ai = result.data;
    const urgencyScore = URGENCY_TO_SCORE[ai.urgency];
    const recommendation: TriageRecommendation = !ai.inScope
      ? 'TRIAGE_LIKELY_OUT_OF_SCOPE'
      : urgencyScore >= 2 || ai.scamSignals.length > 0
        ? 'TRIAGE_PRIORITY' // urgent people first; suspected scams early, before impostors spread
        : 'TRIAGE';

    return { recommendation, urgencyScore, ai, aiOutcome: 'PARSED', redactions };
  }
}
