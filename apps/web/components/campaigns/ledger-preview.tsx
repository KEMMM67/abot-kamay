// apps/web/components/campaigns/ledger-preview.tsx
import Link from 'next/link';
import { LedgerEntryRow } from '@/components/ledger/ledger-entry-row';
import { ArrowNudge } from '@/components/ui/button';
import { LinkPendingBar } from '@/components/ui/link-pending-bar';
import { fmt } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';
import { formatPeso } from '@/lib/money';
import type { LedgerSummary, PublicLedgerEntry } from '@/lib/types';

export async function LedgerTotals({ ledger }: { ledger: LedgerSummary }) {
  const t = (await getMessages()).ledger;
  const totals = [
    { label: t.received, value: ledger.receivedMinor },
    { label: t.disbursed, value: ledger.disbursedMinor },
    { label: t.held, value: ledger.heldMinor },
  ];
  return (
    <dl className="grid grid-cols-3 gap-2 sm:gap-4">
      {totals.map((total) => (
        <div key={total.label} className="rounded-2xl bg-cream-100 px-3 py-3 sm:px-4">
          <dt className="text-sm font-semibold text-ink-600">{total.label}</dt>
          <dd className="mt-0.5 text-lg font-bold tabular-nums text-ink sm:text-xl">
            {formatPeso(total.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Totals and the newest entries, with the link to the full ledger (a trust signal before donating). */
export async function LedgerPreview({
  slug,
  ledger,
  entries,
}: {
  slug: string;
  ledger: LedgerSummary;
  entries: PublicLedgerEntry[];
}) {
  const t = (await getMessages()).ledger;
  return (
    <div className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-6">
      <LedgerTotals ledger={ledger} />
      {entries.length > 0 ? (
        <ul className="mt-4 divide-y divide-ink-100">
          {entries.map((entry) => (
            <LedgerEntryRow key={entry.id} entry={entry} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-2xl bg-cream-50 px-4 py-3 text-ink-700">{t.empty}</p>
      )}
      <Link
        href={`/campaigns/${slug}/ledger`}
        data-testid="public-ledger-link"
        className="group relative mt-2 inline-flex min-h-12 items-center gap-2 font-semibold text-teal-700 underline-offset-4 hover:underline"
      >
        {fmt(t.viewAll, { count: ledger.entryCount })}
        <ArrowNudge className="size-5" />
        <LinkPendingBar className="bottom-1 top-auto rounded-full" />
      </Link>
    </div>
  );
}
