// apps/web/components/campaigns/spending-report-list.tsx
//
// The creator's proof of spending: what was bought, how much, when, where, and the receipts. Reports
// are hash-chained and can never be edited or deleted. Receipt images appear after review (they can
// show names or addresses) and once the media worker has made their public copies; until then the
// report says how many are waiting.
import { Link2, ReceiptText, Store } from 'lucide-react';
import Image from 'next/image';
import { StatusChip } from '@/components/ui/status-chip';
import { cn } from '@/lib/cn';
import { formatCalendarDate, formatDateTime, PROOF_STATUS_TONES } from '@/lib/format';
import { fmt, plural } from '@/lib/i18n/format';
import { getLocale, getMessages } from '@/lib/i18n/server';
import { formatPeso, toMinor } from '@/lib/money';
import type { LedgerSummary, SpendingReport } from '@/lib/types';

/** Paid out vs. backed by receipts: the one number that tells donors whether the creator is on top of it. */
export async function ReceiptTotals({ ledger, className }: { ledger: LedgerSummary; className?: string }) {
  const t = (await getMessages()).ledger;
  const disbursed = toMinor(ledger.disbursedMinor);
  const receipted = toMinor(ledger.receiptedMinor);
  const missing = disbursed > receipted ? disbursed - receipted : 0n;
  const totals = [
    { label: t.receiptsDisbursed, value: disbursed, tone: 'text-ink' },
    { label: t.receiptsBacked, value: receipted, tone: 'text-teal-700' },
    { label: t.receiptsMissing, value: missing, tone: missing > 0n ? 'text-coral-700' : 'text-ink' },
  ];
  return (
    <dl className={cn('grid grid-cols-3 gap-2 sm:gap-4', className)}>
      {totals.map((total) => (
        <div key={total.label} className="rounded-2xl bg-cream-100 px-3 py-3 sm:px-4">
          <dt className="text-sm font-semibold text-ink-600">{total.label}</dt>
          <dd className={cn('mt-0.5 text-lg font-bold tabular-nums sm:text-xl', total.tone)}>
            {formatPeso(total.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export async function SpendingReportList({
  reports,
  headingLevel = 'h3',
}: {
  reports: SpendingReport[];
  headingLevel?: 'h2' | 'h3';
}) {
  const [messages, locale] = await Promise.all([getMessages(), getLocale()]);
  const t = messages.ledger;
  const Heading = headingLevel;
  return (
    <ol className="space-y-4">
      {reports.map((report) => {
        const hidden = report.mediaCount - report.media.length;
        return (
          <li key={report.id} className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <Heading className="font-bold leading-snug text-ink">{report.title}</Heading>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-600">
                  <span>{formatCalendarDate(report.spentOn, locale)}</span>
                  {report.merchantName && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="inline-flex items-center gap-1">
                        <Store aria-hidden className="size-4" />
                        {report.merchantName}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <p className="shrink-0 text-lg font-bold tabular-nums text-ink">
                {formatPeso(report.amountMinor, { cents: 'always' })}
              </p>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusChip tone={PROOF_STATUS_TONES[report.status]}>
                {messages.labels.proofStatus[report.status]}
              </StatusChip>
              {report.milestoneTitle && (
                <StatusChip tone="neutral">
                  {fmt(t.reportFor, { milestone: report.milestoneTitle })}
                </StatusChip>
              )}
            </div>

            {report.note && <p className="mt-3 max-w-prose leading-relaxed text-ink-700">{report.note}</p>}
            {report.status === 'REJECTED' && report.reviewNote && (
              <p className="mt-3 rounded-2xl bg-coral-50 px-4 py-3 text-coral-800">
                <strong>{t.reportRejected}</strong> {report.reviewNote}
              </p>
            )}

            {report.media.length > 0 && (
              <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {report.media.map((media) => (
                  <li key={media.id}>
                    <a
                      href={media.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative block aspect-square overflow-hidden rounded-2xl bg-cream-200"
                    >
                      <Image
                        src={media.url}
                        alt={fmt(t.proofAlt, {
                          kind: messages.labels.proofKind[media.proofKind],
                          title: report.title,
                        })}
                        fill
                        sizes="(min-width: 640px) 10rem, 30vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <span className="sr-only">{messages.common.opensInNewTab}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {hidden > 0 && (
              <p className="mt-4 flex items-center gap-2 rounded-2xl bg-cream-100 px-4 py-3 text-ink-700">
                <ReceiptText aria-hidden className="size-5 shrink-0 text-ink-500" />
                {plural(report.status === 'VERIFIED' ? t.hiddenReviewed : t.hiddenPending, hidden)}
              </p>
            )}

            <p className="mt-4 flex items-center gap-2 text-sm text-ink-600">
              <Link2 aria-hidden className="size-4" />
              <span>
                {fmt(t.postedAt, { date: formatDateTime(report.postedAt, locale) })} ·{' '}
                <span className="font-mono">#{report.hash.slice(0, 12)}</span>
              </span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
