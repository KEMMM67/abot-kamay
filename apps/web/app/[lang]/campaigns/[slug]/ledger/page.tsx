// apps/web/app/[lang]/campaigns/[slug]/ledger/page.tsx
//
// Full public record for one campaign: every donation and payout (newest first, with the hash chain
// visible), and every receipt the creator posted. Donors appear as anonymous or a masked name; the
// ledger never holds personal data.
import { ArrowLeft, Link2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LedgerTotals } from '@/components/campaigns/ledger-preview';
import { ReceiptTotals, SpendingReportList } from '@/components/campaigns/spending-report-list';
import { LedgerEntryRow } from '@/components/ledger/ledger-entry-row';
import { PageTransition } from '@/components/page-transition';
import { ArrowNudge } from '@/components/ui/button';
import { getCampaign, getCampaignLedger, getSpendingReports } from '@/lib/data/campaigns';
import { fmt, plural } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata({
  params,
}: PageProps<'/[lang]/campaigns/[slug]/ledger'>): Promise<Metadata> {
  const { slug } = await params;
  const [campaign, messages] = await Promise.all([getCampaign(slug).catch(() => null), getMessages()]);
  const t = messages.ledger.page;
  return campaign
    ? {
        title: fmt(t.metaTitle, { alias: campaign.beneficiary.alias }),
        description: fmt(t.metaDescription, { title: campaign.title }),
      }
    : { title: t.metaNotFound };
}

export default async function LedgerPage({
  params,
  searchParams,
}: PageProps<'/[lang]/campaigns/[slug]/ledger'>) {
  const { slug } = await params;
  const { cursor } = await searchParams;
  const [campaign, messages] = await Promise.all([getCampaign(slug), getMessages()]);
  if (!campaign) notFound();
  const [page, reports] = await Promise.all([
    getCampaignLedger(slug, typeof cursor === 'string' ? cursor : undefined),
    cursor ? Promise.resolve(null) : getSpendingReports(slug),
  ]);
  if (!page) notFound();
  const t = messages.ledger;

  return (
    <PageTransition>
      <div className="container-page pb-20 pt-4 sm:pt-6">
        <div className="mx-auto max-w-3xl">
          <Link
            href={`/campaigns/${campaign.slug}`}
            className="group -ml-1 inline-flex min-h-12 items-center gap-2 rounded-xl px-1 font-semibold text-ink-700 transition-colors hover:text-teal-700"
          >
            <ArrowLeft
              aria-hidden
              className="size-5 transition-transform duration-300 group-hover:-translate-x-1"
            />
            {fmt(t.page.back, { alias: campaign.beneficiary.alias })}
          </Link>

          <header className="animate-fade-up mt-4">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-teal-700">{t.page.eyebrow}</p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              {campaign.title}
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-ink-700">{t.page.intro}</p>
          </header>

          <div className="animate-fade-up animation-delay-100 mt-8">
            <LedgerTotals ledger={campaign.ledger} />
          </div>

          <section
            aria-labelledby="entries-heading"
            className="animate-fade-up animation-delay-200 mt-10 rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-7"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="entries-heading" className="text-xl font-bold text-ink">
                {cursor ? t.page.older : t.page.newest}
              </h2>
              <p className="text-ink-600">{plural(t.page.total, campaign.ledger.entryCount)}</p>
            </div>

            {page.items.length > 0 ? (
              <ol className="mt-2 divide-y divide-ink-100">
                {page.items.map((entry) => (
                  <LedgerEntryRow key={entry.id} entry={entry} showHashes />
                ))}
              </ol>
            ) : (
              <p className="mt-4 rounded-2xl bg-cream-50 px-4 py-3 text-ink-700">{t.empty}</p>
            )}

            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-ink-100 pt-4">
              {cursor && (
                <Link
                  href={`/campaigns/${campaign.slug}/ledger`}
                  className="inline-flex min-h-12 items-center font-semibold text-teal-700 underline-offset-4 hover:underline"
                >
                  {t.page.backToNewest}
                </Link>
              )}
              {page.nextCursor && (
                <Link
                  href={`/campaigns/${campaign.slug}/ledger?cursor=${encodeURIComponent(page.nextCursor)}`}
                  className="group inline-flex min-h-12 items-center gap-2 font-semibold text-teal-700 underline-offset-4 hover:underline"
                >
                  {t.page.showOlder}
                  <ArrowNudge className="size-5" />
                </Link>
              )}
            </div>
          </section>

          {reports && (
            <section id="resibo" aria-labelledby="receipts-heading" className="mt-10 scroll-mt-28">
              <h2 id="receipts-heading" className="text-2xl font-extrabold tracking-tight text-ink">
                {t.page.receiptsHeading}
              </h2>
              <p className="mt-2 text-lg leading-relaxed text-ink-700">
                {fmt(t.page.receiptsIntro, { creator: campaign.creator.displayName })}
              </p>
              <ReceiptTotals ledger={campaign.ledger} className="mt-6" />
              <div className="mt-6">
                {reports.items.length > 0 ? (
                  <SpendingReportList reports={reports.items} />
                ) : (
                  <p className="rounded-3xl border-2 border-dashed border-ink-200 bg-white p-5 text-ink-700">
                    {t.page.noReceipts}
                  </p>
                )}
              </div>
            </section>
          )}

          <div className="mt-10 flex items-start gap-4 rounded-3xl bg-cream-200/60 p-5">
            <Link2 aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-700" />
            <div className="min-w-0">
              <p className="font-semibold text-ink">{t.page.chainHead}</p>
              <p className="mt-1 break-all font-mono text-sm text-ink-800">{campaign.ledger.headHash}</p>
              <p className="mt-2 text-sm text-ink-700">{t.page.chainHeadBody}</p>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
