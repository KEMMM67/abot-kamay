// apps/web/app/[lang]/campaigns/[slug]/page.tsx
//
// Campaign page: a creator's post. Trust comes before money: who posted it (ID-verified, and how they
// know the person), what AbotKamay checked, the plan for the money, the creator's receipts, the
// timeline and the public ledger are all on the page before anyone donates (the E2E suite checks the
// badge, the timeline and the ledger link). The official short link /c/{slug} redirects here.
import { ArrowLeft, MapPin, ReceiptText, UserRound } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ViewTransition, type ReactNode } from 'react';
import { CampaignStory, SourcePostNote } from '@/components/campaigns/campaign-story';
import { CreatorBadge } from '@/components/campaigns/creator-badge';
import { DonatePanel } from '@/components/campaigns/donate-panel';
import { LedgerPreview } from '@/components/campaigns/ledger-preview';
import { MediaGallery } from '@/components/campaigns/media-gallery';
import { MilestoneList } from '@/components/campaigns/milestone-list';
import { ReceiptTotals, SpendingReportList } from '@/components/campaigns/spending-report-list';
import { StatusBanner } from '@/components/campaigns/status-banner';
import { VerificationTimeline } from '@/components/campaigns/verification-timeline';
import { PageTransition } from '@/components/page-transition';
import { ArrowNudge } from '@/components/ui/button';
import { StatusChip } from '@/components/ui/status-chip';
import { getCampaign } from '@/lib/data/campaigns';
import { formatAgeBand } from '@/lib/format';
import { fmt } from '@/lib/i18n/format';
import { getLocale, getMessages } from '@/lib/i18n/server';

export const revalidate = 30;

// No campaign is rendered at build time. Each one renders on its first visit, in the visitor's
// language, is cached, and is refreshed in the background every 30 seconds (ISR), so a viral spike is
// served from cache.
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps<'/[lang]/campaigns/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const [campaign, t] = await Promise.all([getCampaign(slug).catch(() => null), getMessages()]);
  if (!campaign) return { title: t.campaign.notFoundTitle };
  return {
    title: campaign.title,
    description: campaign.summary,
    alternates: { canonical: `/campaigns/${campaign.slug}` },
    openGraph: {
      type: 'article',
      title: campaign.title,
      description: campaign.summary,
      url: `/campaigns/${campaign.slug}`,
      ...(campaign.cover?.kind === 'IMAGE'
        ? { images: [{ url: campaign.cover.url }] }
        : campaign.cover?.posterUrl
          ? { images: [{ url: campaign.cover.posterUrl }] }
          : {}),
    },
  };
}

function SectionTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
      {children}
    </h2>
  );
}

export default async function CampaignPage({ params }: PageProps<'/[lang]/campaigns/[slug]'>) {
  const { slug } = await params;
  const [campaign, messages, locale] = await Promise.all([getCampaign(slug), getMessages(), getLocale()]);
  if (!campaign) notFound();

  const t = messages.campaign;
  const { beneficiary } = campaign;
  const creator = campaign.creator.displayName;
  const firstPost = campaign.sourcePosts[0];
  const ageBand = formatAgeBand(beneficiary.ageBand, locale);
  const funding = messages.labels.funding[campaign.fundingType];

  return (
    <PageTransition>
      <div className="container-page pb-16 pt-4 sm:pt-6 lg:pb-24">
        <Link
          href="/campaigns"
          className="group -ml-1 inline-flex min-h-12 items-center gap-2 rounded-xl px-1 font-semibold text-ink-700 transition-colors hover:text-teal-700"
        >
          <ArrowLeft
            aria-hidden
            className="size-5 transition-transform duration-300 group-hover:-translate-x-1"
          />
          {t.backToFeed}
        </Link>

        <div className="mt-3 grid gap-8 [grid-template-areas:'header'_'donate'_'body'] lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-x-12 lg:gap-y-12 lg:[grid-template-areas:'header_donate'_'body_donate'] xl:grid-cols-[minmax(0,1fr)_26rem]">
          <header className="min-w-0 [grid-area:header]">
            <StatusBanner status={campaign.status} />
            <ViewTransition name={`campaign-visual-${campaign.slug}`} share="morph" default="none">
              <MediaGallery
                media={campaign.media}
                needs={beneficiary.needCategories}
                alias={beneficiary.alias}
                className="mt-4 first:mt-0"
              />
            </ViewTransition>
            <div className="animate-fade-up mt-8 flex flex-wrap gap-2">
              <StatusChip tone={campaign.fundingType === 'FIXED' ? 'gold' : 'teal'}>
                {funding.name}
              </StatusChip>
            </div>
            <h1
              data-testid="campaign-title"
              className="animate-fade-up mt-3 text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl lg:text-[2.75rem]"
            >
              {campaign.title}
            </h1>
            <ul className="animate-fade-up animation-delay-100 mt-4 flex flex-wrap gap-x-6 gap-y-2 text-lg text-ink-700">
              <li className="inline-flex items-center gap-2">
                <UserRound aria-hidden className="size-5 text-ink-500" />
                {beneficiary.alias}
                {ageBand && <>, {ageBand}</>}
              </li>
              <li className="inline-flex items-center gap-2">
                <MapPin aria-hidden className="size-5 text-ink-500" />
                {beneficiary.region}
              </li>
            </ul>
            <div className="animate-fade-up animation-delay-200 mt-6">
              <CreatorBadge campaign={campaign} />
            </div>
          </header>

          <div className="[grid-area:donate]">
            <DonatePanel
              campaign={{
                id: campaign.id,
                slug: campaign.slug,
                title: campaign.title,
                beneficiaryAlias: beneficiary.alias,
                status: campaign.status,
                fundingType: campaign.fundingType,
                goalMinor: campaign.goalMinor,
                raisedMinor: campaign.raisedMinor,
                donorCount: campaign.donorCount,
                receiptCount: campaign.receiptCount,
              }}
            />
          </div>

          <div className="min-w-0 space-y-16 [grid-area:body]">
            <section aria-labelledby="story-heading">
              <SectionTitle id="story-heading">
                {fmt(t.storyHeading, { alias: beneficiary.alias })}
              </SectionTitle>
              <p className="mt-2 text-ink-600">{fmt(t.writtenBy, { creator })}</p>
              <div className="mt-5">
                <CampaignStory story={campaign.story} />
              </div>
              {firstPost && (
                <div className="mt-6">
                  <SourcePostNote post={firstPost} />
                </div>
              )}
            </section>

            <section aria-labelledby="plan-heading">
              <SectionTitle id="plan-heading">{t.planHeading}</SectionTitle>
              <p className="mt-2 max-w-prose text-lg leading-relaxed text-ink-700">{funding.meaning}</p>
              <div className="mt-6">
                <MilestoneList milestones={campaign.milestones} />
              </div>
              <p className="mt-4 max-w-prose rounded-2xl bg-cream-200/60 p-4 leading-relaxed text-ink-800">
                <strong className="text-ink">{t.excessLabel}</strong> {campaign.excessFundsPolicy}
              </p>
            </section>

            <section aria-labelledby="receipts-heading">
              <SectionTitle id="receipts-heading">{t.receiptsHeading}</SectionTitle>
              <p className="mt-2 max-w-prose text-lg leading-relaxed text-ink-700">
                {fmt(t.receiptsIntro, { creator })}
              </p>
              <ReceiptTotals ledger={campaign.ledger} className="mt-6" />
              <div className="mt-6">
                {campaign.spendingReports.length > 0 ? (
                  <SpendingReportList reports={campaign.spendingReports} />
                ) : (
                  <p className="flex items-center gap-3 rounded-3xl border-2 border-dashed border-ink-200 bg-white p-5 text-ink-700">
                    <ReceiptText aria-hidden className="size-6 shrink-0 text-ink-500" />
                    {t.noReceipts}
                  </p>
                )}
              </div>
              {campaign.spendingReportCount > campaign.spendingReports.length && (
                <Link
                  href={`/campaigns/${campaign.slug}/ledger#resibo`}
                  className="group mt-4 inline-flex min-h-12 items-center gap-2 font-semibold text-teal-700 underline-offset-4 hover:underline"
                >
                  {fmt(t.allReceipts, { count: campaign.spendingReportCount })}
                  <ArrowNudge className="size-5" />
                </Link>
              )}
            </section>

            <section aria-labelledby="timeline-heading">
              <SectionTitle id="timeline-heading">{t.timelineHeading}</SectionTitle>
              <p className="mt-2 max-w-prose text-lg leading-relaxed text-ink-700">{t.timelineIntro}</p>
              <div className="mt-8">
                <VerificationTimeline events={campaign.timeline} />
              </div>
            </section>

            <section aria-labelledby="ledger-heading">
              <SectionTitle id="ledger-heading">{t.ledgerHeading}</SectionTitle>
              <p className="mt-2 max-w-prose text-lg leading-relaxed text-ink-700">{t.ledgerIntro}</p>
              <div className="mt-6">
                <LedgerPreview
                  slug={campaign.slug}
                  ledger={campaign.ledger}
                  entries={campaign.recentLedger}
                />
              </div>
            </section>

            <p className="rounded-2xl bg-cream-100 p-4 text-ink-700">
              {fmt(t.areYouCreator, { creator })}{' '}
              <Link
                href={`/campaigns/${campaign.slug}/mag-ulat`}
                className="font-semibold text-teal-700 underline underline-offset-4"
              >
                {t.reportSpending}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
