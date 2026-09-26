// apps/web/components/ledger/ledger-entry-row.tsx
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { fmt } from '@/lib/i18n/format';
import { getLocale, getMessages } from '@/lib/i18n/server';
import { formatPeso } from '@/lib/money';
import type { PublicLedgerEntry } from '@/lib/types';

/**
 * One public ledger entry. The API labels donors "Anonymous" or with a masked name such as "Maria S.";
 * never contact details.
 */
export async function LedgerEntryRow({
  entry,
  showHashes = false,
}: {
  entry: PublicLedgerEntry;
  showHashes?: boolean;
}) {
  const [messages, locale] = await Promise.all([getMessages(), getLocale()]);
  const t = messages.ledger;
  const incoming = entry.direction === 'IN';
  const donor =
    entry.donorLabel === null
      ? t.someDonor
      : entry.donorLabel === 'Anonymous'
        ? t.anonymousDonor
        : entry.donorLabel;
  const title = incoming ? fmt(t.donationFrom, { donor }) : entry.description;

  return (
    <li className="flex items-start gap-3 py-4 sm:gap-4">
      <span
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-full',
          incoming ? 'bg-teal-50 text-teal-700' : 'bg-gold-100 text-gold-800',
        )}
      >
        {incoming ? (
          <ArrowDownLeft aria-hidden className="size-5" />
        ) : (
          <ArrowUpRight aria-hidden className="size-5" />
        )}
        <span className="sr-only">{incoming ? t.moneyIn : t.moneyOut}</span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 font-semibold text-ink">{title}</p>
          <p className={cn('shrink-0 font-bold tabular-nums', incoming ? 'text-teal-700' : 'text-ink')}>
            {incoming ? '+' : '−'}
            {formatPeso(entry.amountMinor, { cents: 'always' })}
          </p>
        </div>
        <p className="mt-0.5 text-sm text-ink-600">
          <time dateTime={entry.occurredAt}>{formatDateTime(entry.occurredAt, locale)}</time>
          <span aria-hidden> · </span>
          <span className="font-mono">#{entry.hash.slice(0, 12)}</span>
        </p>
        {showHashes && (
          <details className="group/hash mt-2">
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-teal-700 underline-offset-4 hover:underline">
              {t.showHash}
            </summary>
            <dl className="mt-1 space-y-2 rounded-2xl bg-cream-100 p-3 text-sm">
              <div>
                <dt className="font-semibold text-ink-700">{fmt(t.entryHash, { seq: entry.seq })}</dt>
                <dd className="break-all font-mono text-ink-800">{entry.hash}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink-700">{t.previousHash}</dt>
                <dd className="break-all font-mono text-ink-800">{entry.prevHash}</dd>
              </div>
            </dl>
          </details>
        )}
      </div>
    </li>
  );
}
