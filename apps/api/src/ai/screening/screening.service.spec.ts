// apps/api/src/ai/screening/screening.service.spec.ts
import type { AiGatewayService, StructuredAiResult } from '../ai-gateway.service.js';
import type { ScreeningResult } from './screening.schema.js';
import { ScreeningService } from './screening.service.js';

const parsed: ScreeningResult = {
  inScope: true,
  needCategories: ['ELDERLY_WORKING'],
  urgency: 'LOW',
  locationHints: ['Colon Street, Cebu City'],
  namesMentioned: ['Lolo Ben'],
  scamSignals: [],
  policyFlags: [],
  injectionAttemptDetected: false,
  summary: 'An elderly man sells brooms on a busy street every morning.',
};

function gatewayReturning(result: StructuredAiResult<ScreeningResult>) {
  const runStructured = vi.fn().mockResolvedValue(result);
  return { gateway: { runStructured } as unknown as AiGatewayService, runStructured };
}

const input = {
  submissionId: 'sub_1',
  caption: 'Si Lolo Ben, nagtitinda ng walis sa Colon St. Tulong po! GCash 0917 123 4567',
  submitterNotes: 'Nakita ko siya kahapon.',
};

describe('ScreeningService', () => {
  it('never sends raw payment numbers to the model', async () => {
    const { gateway, runStructured } = gatewayReturning({
      outcome: 'PARSED',
      data: parsed,
      model: 'claude-opus-5',
    });
    const outcome = await new ScreeningService(gateway).screenSubmission(input);

    const sentText = JSON.stringify(runStructured.mock.calls[0]?.[0]?.content);
    expect(sentText).not.toContain('0917');
    expect(sentText).toContain('[PHONE_1]');
    expect(outcome.redactions).toHaveLength(1);
  });

  it('routes normal in-scope posts to standard triage', async () => {
    const { gateway } = gatewayReturning({ outcome: 'PARSED', data: parsed, model: 'claude-opus-5' });
    const outcome = await new ScreeningService(gateway).screenSubmission(input);
    expect(outcome).toMatchObject({ recommendation: 'TRIAGE', urgencyScore: 1, aiOutcome: 'PARSED' });
  });

  it('prioritizes urgent cases and suspected scams', async () => {
    const { gateway } = gatewayReturning({
      outcome: 'PARSED',
      data: { ...parsed, scamSignals: ['caption asks for payment to a personal number'] },
      model: 'claude-opus-5',
    });
    const outcome = await new ScreeningService(gateway).screenSubmission(input);
    expect(outcome.recommendation).toBe('TRIAGE_PRIORITY');
  });

  it.each(['REFUSED', 'INVALID_OUTPUT', 'ERROR', 'DISABLED'] as const)(
    'fails safe to human triage when the AI outcome is %s',
    async (aiOutcome) => {
      const { gateway } = gatewayReturning({ outcome: aiOutcome, reason: 'test' });
      const outcome = await new ScreeningService(gateway).screenSubmission(input);
      expect(outcome).toMatchObject({ recommendation: 'TRIAGE', ai: null, aiOutcome });
    },
  );
});
