// apps/web/app/[lang]/campaigns/(feed)/page.tsx
//
// The feed at /campaigns: creator posts, newest first, one column like a social media feed. Videos play
// like TikTok (muted, in view); photos read like a Facebook post. Every post is from an ID-verified
// creator and passed a human review; each shows the money raised and how many receipts the creator has
// posted. It lives in the (feed) route group so its loading skeleton wraps only this page: campaign
// pages stay outside any Suspense boundary and can answer with a real 404.
import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { EmptyFeed } from '@/components/feed/empty-feed';
import { ComposerPrompt, FeedTrust } from '@/components/feed/feed-aside';
import { FeedPost } from '@/components/feed/feed-post';
import { PageTransition } from '@/components/page-transition';
import { ButtonLink } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { SectionHeading } from '@/components/ui/section-heading';
import { listCampaigns, nullWhileBuilding } from '@/lib/data/campaigns';
import { fmt, plural } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getMessages()).feed;
  return {
    title: t.metaTitle,
    description: t.metaDescription,
    alternates: { canonical: '/campaigns' },
  };
}

export const revalidate = 30;

/** After this many posts, phones see the invitation to post (desktop has it in the sidebar). */
const PROMPT_AFTER = 2;

export default async function FeedPage() {
  const [campaigns, messages] = await Promise.all([
    nullWhileBuilding(listCampaigns(), 'feed'),
    getMessages(),
  ]);
  const t = messages.feed;
  const accepting = campaigns?.filter((campaign) => campaign.status === 'ACTIVE').length ?? 0;

  return (
    <PageTransition>
      <div className="container-page pb-20 pt-8 sm:pt-12">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,40rem)_minmax(0,22rem)] lg:justify-between">
          <div className="min-w-0">
            <SectionHeading
              as="h1"
              eyebrow={t.eyebrow}
              title={t.title}
              description={t.description}
              className="animate-fade-up"
            />

            {campaigns === null && (
              <Notice
                title={t.errorTitle}
                className="mt-10"
                action={
                  <ButtonLink href="/campaigns" variant="secondary">
                    {messages.common.tryAgain}
                  </ButtonLink>
                }
              >
                {t.errorBody}
              </Notice>
            )}

            {campaigns?.length === 0 && <EmptyFeed className="mt-10" />}

            {campaigns && campaigns.length > 0 && (
              <>
                <p className="animate-fade-in animation-delay-200 mt-8 flex items-center gap-2 text-ink-600">
                  <ShieldCheck aria-hidden className="size-5 text-teal-700" />
                  {plural(t.postsCount, campaigns.length)} · {fmt(t.acceptingCount, { count: accepting })}
                </p>
                <ol className="mt-5 space-y-6">
                  {campaigns.map((campaign, index) => (
                    <li key={campaign.id}>
                      <FeedPost campaign={campaign} index={index} headingLevel="h2" priority={index === 0} />
                      {index === PROMPT_AFTER - 1 && <ComposerPrompt className="mt-6 lg:hidden" />}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>

          <aside aria-label={t.asideLabel} className="hidden lg:block">
            <div className="sticky top-28 space-y-6">
              <ComposerPrompt />
              <FeedTrust />
            </div>
          </aside>
        </div>
      </div>
    </PageTransition>
  );
}
