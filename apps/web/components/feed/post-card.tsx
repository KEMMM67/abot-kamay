// apps/web/components/feed/post-card.tsx
//
// A compact post for grids (the landing page): who posted it, the first photo or the video's poster,
// the title and the money. The feed itself uses the full-size FeedPost. The whole card is one link
// (the title), so keyboard and screen-reader users meet one tab stop with a clear name.
import { MapPin } from 'lucide-react';
import Link from 'next/link';
import { ViewTransition } from 'react';
import { PostMedia } from '@/components/campaigns/post-media';
import { LinkPendingBar } from '@/components/ui/link-pending-bar';
import { cn, type StyleWithVars } from '@/lib/cn';
import { formatAgeBand } from '@/lib/format';
import { getLocale } from '@/lib/i18n/server';
import type { CampaignSummary } from '@/lib/types';
import { PostByline } from './post-byline';
import { PostFunding } from './post-funding';

export async function PostCard({
  campaign,
  index = 0,
  headingLevel = 'h2',
  priority = false,
}: {
  campaign: CampaignSummary;
  /** Position in the list, for the staggered entrance. */
  index?: number;
  headingLevel?: 'h2' | 'h3';
  /** Load the image eagerly: only for the first post above the fold. */
  priority?: boolean;
}) {
  const locale = await getLocale();
  const { slug, title, summary, beneficiary } = campaign;
  const Heading = headingLevel;
  const ageBand = formatAgeBand(beneficiary.ageBand, locale);

  return (
    <article
      style={{ '--i': index } as StyleWithVars}
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-card',
        'transition duration-300 ease-out-expo hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-lift',
        'has-[a:focus-visible]:outline-3 has-[a:focus-visible]:outline-offset-4 has-[a:focus-visible]:outline-teal-600',
        'animate-fade-up stagger',
      )}
    >
      <PostByline campaign={campaign} className="px-4 py-3.5" />

      <ViewTransition name={`campaign-visual-${slug}`} share="morph" default="none">
        <PostMedia
          media={campaign.cover}
          needs={beneficiary.needCategories}
          alias={beneficiary.alias}
          sizes="(min-width: 1024px) 26rem, (min-width: 640px) 50vw, 100vw"
          priority={priority}
          className={campaign.cover ? 'aspect-4/3' : 'aspect-16/9'}
        />
      </ViewTransition>

      <div className="flex flex-1 flex-col p-5">
        <Heading className="text-xl font-bold leading-snug tracking-tight text-ink">
          <Link
            href={`/campaigns/${slug}`}
            className="transition-colors duration-200 after:absolute after:inset-0 after:content-[''] group-hover:text-teal-800 focus-visible:outline-none"
          >
            {title}
            <LinkPendingBar />
          </Link>
        </Heading>
        <p className="mt-2 flex items-center gap-1.5 text-ink-600">
          <MapPin aria-hidden className="size-4 shrink-0" />
          <span className="truncate">
            {beneficiary.alias}
            {ageBand && <> · {ageBand}</>} · {beneficiary.region}
          </span>
        </p>
        <p className="mt-3 line-clamp-3 leading-relaxed text-ink-700">{summary}</p>
        <PostFunding campaign={campaign} className="mt-auto pt-5" />
      </div>
    </article>
  );
}
