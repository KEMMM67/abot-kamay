// apps/web/app/[lang]/page.tsx
//
// Landing page. The feed is the product, so newest posts come right after the hero; then how posting
// works, the two kinds of campaign, the invitation to post, and the "Legit ba 'to?" checker.
import Link from 'next/link';
import { CampaignGrid } from '@/components/campaigns/campaign-grid';
import { EmptyFeed } from '@/components/feed/empty-feed';
import { CreatorCta } from '@/components/home/creator-cta';
import { FundingTypes } from '@/components/home/funding-types';
import { Hero } from '@/components/home/hero';
import { HowItWorks } from '@/components/home/how-it-works';
import { TrustBand } from '@/components/home/trust-band';
import { PageTransition } from '@/components/page-transition';
import { ArrowNudge } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { SectionHeading } from '@/components/ui/section-heading';
import { getFeaturedCampaigns, nullWhileBuilding } from '@/lib/data/campaigns';
import { getMessages } from '@/lib/i18n/server';

// Re-render in the background at most every 30 seconds (CDN-friendly; totals stay fresh enough).
export const revalidate = 30;

export default async function HomePage() {
  // null only when the list could not load at build time; the hero and the checker still work.
  const [featured, messages] = await Promise.all([
    nullWhileBuilding(getFeaturedCampaigns(3), 'home'),
    getMessages(),
  ]);
  const t = messages.home;

  return (
    <PageTransition>
      <Hero />

      <section aria-labelledby="featured-heading" className="pb-16 sm:pb-24">
        <div className="container-page">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeading
              id="featured-heading"
              eyebrow={t.featuredEyebrow}
              title={t.featuredTitle}
              description={t.featuredDescription}
            />
            <Link
              href="/campaigns"
              className="group inline-flex min-h-12 shrink-0 items-center gap-2 text-lg font-semibold text-teal-700 underline-offset-4 hover:underline"
            >
              {t.seeFullFeed}
              <ArrowNudge className="size-5" />
            </Link>
          </div>

          {featured === null ? (
            <Notice title={t.loadingTitle} className="mt-10">
              {t.loadingBody}
            </Notice>
          ) : featured.length === 0 ? (
            <EmptyFeed headingLevel="h3" className="mt-10" />
          ) : (
            <CampaignGrid campaigns={featured} headingLevel="h3" className="mt-10" />
          )}
        </div>
      </section>

      <HowItWorks />
      <FundingTypes />
      <CreatorCta />
      <TrustBand />
    </PageTransition>
  );
}
