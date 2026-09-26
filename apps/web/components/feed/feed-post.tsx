// apps/web/components/feed/feed-post.tsx
//
// One post in the media-first feed, laid out by what the creator posted:
// - A video first: TikTok-style. The video fills a tall frame and plays by itself (muted) while it is
//   on screen; who posted it sits over the top, where the person is over the bottom, and the title and
//   the money follow right below.
// - Photos first: a Facebook-style post. Who posted it, the title and caption, the photos (a collage
//   of up to four, "+N" for the rest), then the money.
// - Nothing public yet (the media worker is still making the public copies, or a photo of a child is
//   held for blurring): the need illustration, never a stock or AI face.
// The title is the card's one link and stretches over the whole card; the video sits above it
// (z-10), so tapping the video plays or pauses it and tapping anything else opens the campaign.
// Keyboard and screen-reader users meet one link per post, plus the video's play and sound buttons.
import { MapPin } from 'lucide-react';
import Link from 'next/link';
import { ViewTransition } from 'react';
import { NeedVisual } from '@/components/campaigns/need-visual';
import { LinkPendingBar } from '@/components/ui/link-pending-bar';
import { cn, type StyleWithVars } from '@/lib/cn';
import { formatAgeBand } from '@/lib/format';
import { fmt } from '@/lib/i18n/format';
import { getLocale, getMessages } from '@/lib/i18n/server';
import type { CampaignSummary } from '@/lib/types';
import { FeedVideo } from './feed-video';
import { frameRatio, MediaCollage } from './media-collage';
import { PostByline } from './post-byline';
import { PostFunding } from './post-funding';

export async function FeedPost({
  campaign,
  index = 0,
  headingLevel = 'h2',
  priority = false,
}: {
  campaign: CampaignSummary;
  /** Position in the list, for the staggered entrance. */
  index?: number;
  headingLevel?: 'h2' | 'h3';
  /** The first post above the fold: its photo loads eagerly. */
  priority?: boolean;
}) {
  const [t, locale] = await Promise.all([getMessages(), getLocale()]);
  const { slug, title, summary, beneficiary } = campaign;
  const Heading = headingLevel;
  const media = campaign.media.length > 0 ? campaign.media : campaign.cover ? [campaign.cover] : [];
  const lead = media[0];
  const more = Math.max(0, campaign.mediaCount - media.length);
  const ageBand = formatAgeBand(beneficiary.ageBand, locale);
  const where = (
    <>
      {beneficiary.alias}
      {ageBand && <> · {ageBand}</>} · {beneficiary.region}
    </>
  );

  const titleLink = (
    <Heading className="text-xl font-bold leading-snug tracking-tight text-ink">
      <Link
        href={`/campaigns/${slug}`}
        className="transition-colors duration-200 after:absolute after:inset-0 after:content-[''] group-hover:text-teal-800 focus-visible:outline-none"
      >
        {title}
        <LinkPendingBar />
      </Link>
    </Heading>
  );

  return (
    <article
      style={{ '--i': index } as StyleWithVars}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-card',
        'transition duration-300 ease-out-expo hover:border-teal-200 hover:shadow-lift',
        'has-[a:focus-visible]:outline-3 has-[a:focus-visible]:outline-offset-4 has-[a:focus-visible]:outline-teal-600',
        'animate-fade-up stagger',
      )}
    >
      {lead?.kind === 'VIDEO' ? (
        <>
          <ViewTransition name={`campaign-visual-${slug}`} share="morph" default="none">
            <FeedVideo
              src={lead.url}
              poster={lead.posterUrl}
              label={lead.altText ?? fmt(t.media.videoAbout, { alias: beneficiary.alias })}
              aspectRatio={frameRatio(lead)}
              className="z-10"
            >
              <div className="bg-linear-to-b from-ink/75 via-ink/35 to-transparent px-4 pb-12 pr-16 pt-3.5">
                <PostByline campaign={campaign} onMedia />
              </div>
              <div className="flex items-end justify-between gap-3 bg-linear-to-t from-ink/80 via-ink/35 to-transparent px-4 pb-5 pt-16">
                <p className="flex min-w-0 items-center gap-1.5 font-semibold text-white drop-shadow">
                  <MapPin aria-hidden className="size-4 shrink-0" />
                  <span className="truncate">{where}</span>
                </p>
                {more > 0 && (
                  <span className="shrink-0 rounded-full bg-white/90 px-3 py-1 text-sm font-bold text-ink">
                    {fmt(t.feed.post.moreMedia, { count: more })}
                  </span>
                )}
              </div>
            </FeedVideo>
          </ViewTransition>
          <div className="p-5">
            {titleLink}
            <p className="mt-2 line-clamp-3 leading-relaxed text-ink-700">{summary}</p>
            <PostFunding campaign={campaign} className="mt-5" />
          </div>
        </>
      ) : (
        <>
          <PostByline campaign={campaign} className="px-4 py-3.5" />
          <div className="px-5 pb-4">
            {titleLink}
            <p className="mt-2 line-clamp-3 leading-relaxed text-ink-700">{summary}</p>
          </div>
          <ViewTransition name={`campaign-visual-${slug}`} share="morph" default="none">
            {lead ? (
              <MediaCollage media={media} more={more} alias={beneficiary.alias} priority={priority} />
            ) : (
              <NeedVisual needs={beneficiary.needCategories} className="aspect-16/9" />
            )}
          </ViewTransition>
          <div className="p-5">
            <p className="flex items-center gap-1.5 text-ink-600">
              <MapPin aria-hidden className="size-4 shrink-0" />
              <span className="truncate">{where}</span>
            </p>
            <PostFunding campaign={campaign} className="mt-4" />
          </div>
        </>
      )}
    </article>
  );
}
