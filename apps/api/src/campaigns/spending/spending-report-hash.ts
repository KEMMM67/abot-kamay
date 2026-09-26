// apps/api/src/campaigns/spending/spending-report-hash.ts
//
// Creator spending reports form one hash chain per campaign, like the money ledger
// (ledger/ledger-hash.ts): each report's hash covers its facts, the sha256 of every receipt and photo,
// and the previous report's hash. Editing a report, swapping a receipt image, or deleting a report in
// the middle would break every later hash, and the database refuses all three anyway
// (migration 20260925000200).
//
// hash = sha256( canonicalJson({ campaignId, authorId, milestoneId, title, note, amountMinor, currency,
//                               spentOn, merchantName, media (by position), prevHash }) )
import { createHash } from 'node:crypto';
import type { SpendingProofKind } from '../../generated/prisma/enums.js';
import { canonicalJson, GENESIS_HASH } from '../../ledger/ledger-hash.js';

export { GENESIS_HASH };

export interface SpendingReportContent {
  campaignId: string;
  authorId: string;
  milestoneId: string | null;
  title: string;
  note: string | null;
  amountMinor: bigint;
  currency: string;
  /** YYYY-MM-DD, the date on the receipt. */
  spentOn: string;
  merchantName: string | null;
  media: ReadonlyArray<{ position: number; kind: SpendingProofKind; sha256: string }>;
}

export function canonicalSpendingPayload(content: SpendingReportContent, prevHash: string): string {
  return canonicalJson({
    campaignId: content.campaignId,
    authorId: content.authorId,
    milestoneId: content.milestoneId,
    title: content.title,
    note: content.note,
    amountMinor: content.amountMinor.toString(),
    currency: content.currency,
    spentOn: content.spentOn,
    merchantName: content.merchantName,
    media: [...content.media]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({ position: item.position, kind: item.kind, sha256: item.sha256 })),
    prevHash,
  });
}

export function computeSpendingReportHash(content: SpendingReportContent, prevHash: string): string {
  return createHash('sha256').update(canonicalSpendingPayload(content, prevHash), 'utf8').digest('hex');
}

export type SpendingChainCheck =
  { valid: true; length: number } | { valid: false; brokenAt: number; reason: string };

/** Recomputes a campaign's report chain, oldest first. Anyone can run this on the public export. */
export function verifySpendingChain(
  links: ReadonlyArray<{ prevHash: string; hash: string; content: SpendingReportContent }>,
): SpendingChainCheck {
  let expectedPrev = GENESIS_HASH;
  for (const [index, link] of links.entries()) {
    if (link.prevHash !== expectedPrev) {
      return { valid: false, brokenAt: index, reason: 'prevHash does not match the previous report hash' };
    }
    if (computeSpendingReportHash(link.content, link.prevHash) !== link.hash) {
      return { valid: false, brokenAt: index, reason: 'stored hash does not match the report content' };
    }
    expectedPrev = link.hash;
  }
  return { valid: true, length: links.length };
}
