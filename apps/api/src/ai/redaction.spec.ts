// apps/api/src/ai/redaction.spec.ts
import { redactPii } from './redaction.js';

describe('redactPii', () => {
  it('replaces Philippine mobile numbers in every common format', () => {
    const { text, findings } = redactPii('GCash: 0917 123 4567 or +63 917-123-4567 or 639171234567');
    expect(text).toBe('GCash: [PHONE_1] or [PHONE_2] or [PHONE_3]');
    expect(findings).toHaveLength(3);
    // Same number in three formats normalizes to one hash, so the registry lookup matches all of them.
    expect(new Set(findings.map((f) => f.valueHash)).size).toBe(1);
  });

  it('replaces emails and long account numbers', () => {
    const { text, findings } = redactPii('Email tulong@example.ph, BPI acct 1234-5678-9012');
    expect(text).toBe('Email [EMAIL_1], BPI acct [ACCOUNT_NUMBER_1]');
    expect(findings.map((f) => f.kind)).toEqual(['EMAIL', 'ACCOUNT_NUMBER']);
  });

  it('leaves ordinary text and short numbers alone', () => {
    const input = 'Si Lolo Ben, 78 taong gulang, nagtitinda ng walis sa Cebu City mula 5AM.';
    expect(redactPii(input)).toEqual({ text: input, findings: [] });
  });
});
