# AbotKamay scenario generator prompt (scenario-gen.v1)

File: qa/e2e-selenium/ai/generate-scenarios.prompt.md

Use this prompt with Claude (model `claude-opus-5`, structured output against `scenario.schema` below, effort `high`) or with Claude Code in CI. Paste the requirement list and the relevant OpenAPI excerpt where indicated. Commit the output to `src/test/resources/scenarios/<catalog>.scenarios.json` in a pull request. Every new scenario must start with `"review": { "status": "PENDING_REVIEW" }`. Only a human reviewer may change it to `APPROVED`.

---

You are a senior QA engineer for AbotKamay, a Philippine donation platform. Viral posts about people in need become field-verified campaigns with a public, hash-chained ledger. Donors pay with GCash, Maya or cards. Money correctness and donor trust matter more than anything else.

Generate end-to-end browser test scenarios for the catalog named `{{CATALOG_NAME}}`.

Requirements (each has an id such as AK-DON-001):
{{REQUIREMENTS}}

Relevant API contract (OpenAPI excerpt):
{{OPENAPI_EXCERPT}}

Existing scenario ids and titles (do not duplicate them):
{{EXISTING_SCENARIOS}}

Produce scenarios that together cover:
1. The main success path for every payment method named in the requirements.
2. Boundary values: exact minimums and maximums, one centavo below and above, and the largest realistic amount.
3. Failure paths: declined payment, abandoned checkout, gateway timeout. The ledger must stay unchanged.
4. Input abuse: scientific notation, negative numbers, commas and currency symbols, whitespace, very long input, pasted emoji.
5. Trust and privacy: anonymous donations, what the public ledger shows, fee disclosure before payment.
6. Concurrency and idempotency: double submit, back button after paying, refresh on the receipt page.
7. Context the donor arrives from: TikTok and Facebook in-app browsers, slow mobile networks.

Rules:
- Each scenario traces to at least one requirement id, and has a risk level (LOW, MEDIUM, HIGH, CRITICAL) based on money or trust impact.
- Amounts are strings exactly as a donor would type them. `ledgerAmountMinor` is the expected amount in centavos, as a string.
- `sandboxOutcome` must be AUTHORIZE for RECEIPT, FAIL for DECLINED, and NOT_REACHED for VALIDATION_ERROR.
- `messageContains` is a short, stable fragment of the message the donor sees, not a full sentence. The UI is in Filipino, so use the Filipino fragment (for example "pinakamababa" for the minimum amount, "tamang halaga" for an invalid amount, "tinanggihan" for a declined payment).
- If a scenario needs a UI action the page objects do not have yet, still include it. Explain the missing action in `review.notes`.
- Set `"origin": "AI_GENERATED"` and `"review": { "status": "PENDING_REVIEW", "reviewedBy": null, "reviewedAt": null, "notes": ... }`.
- Output only JSON matching `scenario.schema`. Do not wrap it in prose.

## scenario.schema (for structured outputs)

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["scenarios"],
  "properties": {
    "scenarios": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "title", "requirementIds", "origin", "review", "tags", "riskLevel", "input", "sandboxOutcome", "expected"],
        "properties": {
          "id": { "type": "string", "description": "DON-### style id, unique in the catalog" },
          "title": { "type": "string" },
          "requirementIds": { "type": "array", "items": { "type": "string" } },
          "origin": { "type": "string", "enum": ["AI_GENERATED"] },
          "review": {
            "type": "object",
            "additionalProperties": false,
            "required": ["status", "reviewedBy", "reviewedAt", "notes"],
            "properties": {
              "status": { "type": "string", "enum": ["PENDING_REVIEW"] },
              "reviewedBy": { "type": "null" },
              "reviewedAt": { "type": "null" },
              "notes": { "type": ["string", "null"] }
            }
          },
          "tags": { "type": "array", "items": { "type": "string" } },
          "riskLevel": { "type": "string", "enum": ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
          "input": {
            "type": "object",
            "additionalProperties": false,
            "required": ["amount", "paymentMethod", "anonymous"],
            "properties": {
              "amount": { "type": "string" },
              "paymentMethod": { "type": "string", "enum": ["GCASH", "MAYA", "CARD"] },
              "anonymous": { "type": "boolean" }
            }
          },
          "sandboxOutcome": { "type": "string", "enum": ["AUTHORIZE", "FAIL", "NOT_REACHED"] },
          "expected": {
            "type": "object",
            "additionalProperties": false,
            "required": ["outcome", "ledgerAmountMinor", "ledgerDonorLabel", "messageContains"],
            "properties": {
              "outcome": { "type": "string", "enum": ["RECEIPT", "DECLINED", "VALIDATION_ERROR"] },
              "ledgerAmountMinor": { "type": ["string", "null"] },
              "ledgerDonorLabel": { "type": ["string", "null"] },
              "messageContains": { "type": ["string", "null"] }
            }
          }
        }
      }
    }
  }
}
```

## Review checklist (human reviewer)

- Is the expected outcome actually what the product should do? AI can invent plausible but wrong behavior.
- Is the amount math right (pesos to centavos)?
- Does the scenario add coverage, or does it duplicate an existing one?
- Can it be executed with the existing page objects? If not, add the page-object action in the same pull request, or keep the scenario PENDING_REVIEW.
- Set `review.status` to APPROVED, and fill in `reviewedBy` and `reviewedAt`.
