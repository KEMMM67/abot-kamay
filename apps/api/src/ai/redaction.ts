// apps/api/src/ai/redaction.ts
//
// Deterministic PII redaction BEFORE any text reaches an AI model. Payment numbers are the #1 scam
// vector in comments on viral posts ("send GCash to 0917..."), so they are replaced with
// placeholders and hashed; the hashes are checked against the verified/blocked payment-channel
// registry by plain code, never by the model.
import { createHash } from 'node:crypto';

export type RedactionKind = 'PHONE' | 'EMAIL' | 'ACCOUNT_NUMBER';

export interface RedactionFinding {
  kind: RedactionKind;
  placeholder: string;
  /** sha256 of the normalized value (digits only / lower-cased email). */
  valueHash: string;
}

export interface RedactionResult {
  text: string;
  findings: RedactionFinding[];
}

const PATTERNS: ReadonlyArray<{ kind: RedactionKind; regex: RegExp; normalize: (raw: string) => string }> = [
  {
    kind: 'EMAIL',
    regex: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    normalize: (raw) => raw.toLowerCase(),
  },
  {
    // Philippine mobile numbers: 09XX XXX XXXX, +63 9XX XXX XXXX, 639XXXXXXXXX (spaces/dashes allowed)
    kind: 'PHONE',
    regex: /(?:\+?63|0)[\s-]?9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g,
    normalize: (raw) => raw.replace(/\D/g, '').replace(/^0/, '63'),
  },
  {
    // Bank/e-wallet account and card-like numbers: 10-19 digits, optionally grouped
    kind: 'ACCOUNT_NUMBER',
    regex: /\b\d(?:[\s-]?\d){9,18}\b/g,
    normalize: (raw) => raw.replace(/\D/g, ''),
  },
];

export function redactPii(input: string): RedactionResult {
  const findings: RedactionFinding[] = [];
  const counters: Record<RedactionKind, number> = { PHONE: 0, EMAIL: 0, ACCOUNT_NUMBER: 0 };
  let text = input;

  for (const { kind, regex, normalize } of PATTERNS) {
    text = text.replace(regex, (match) => {
      counters[kind] += 1;
      const placeholder = `[${kind}_${counters[kind]}]`;
      findings.push({
        kind,
        placeholder,
        valueHash: createHash('sha256').update(normalize(match)).digest('hex'),
      });
      return placeholder;
    });
  }
  return { text, findings };
}
