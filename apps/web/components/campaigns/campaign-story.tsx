// apps/web/components/campaigns/campaign-story.tsx
import { BadgeCheck, Link2, Quote } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { fmt } from '@/lib/i18n/format';
import { getLocale, getMessages } from '@/lib/i18n/server';
import type { SourcePost } from '@/lib/types';

/** The caption as the creator wrote it, with consent. A paragraph starting with "> " is a quote. */
export function CampaignStory({ story }: { story: string }) {
  const paragraphs = story
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <div className="max-w-prose space-y-5 text-lg leading-relaxed text-ink-800">
      {paragraphs.map((paragraph) =>
        paragraph.startsWith('> ') ? (
          <blockquote
            key={paragraph}
            className="relative rounded-3xl bg-cream-200/70 py-5 pl-14 pr-6 text-xl font-semibold leading-snug text-ink"
          >
            <Quote aria-hidden className="absolute left-5 top-5 size-6 text-coral-500" />
            <p>{paragraph.slice(2)}</p>
          </blockquote>
        ) : (
          <p key={paragraph}>{paragraph}</p>
        ),
      )}
    </div>
  );
}

/** Where the campaign started. Posts are linked, never re-hosted (TECHNICAL_PLAN.md 0.3). */
export async function SourcePostNote({ post }: { post: SourcePost }) {
  const [messages, locale] = await Promise.all([getMessages(), getLocale()]);
  const t = messages.campaign.source;
  const platform = messages.labels.platforms[post.platform];
  return (
    <div className="flex max-w-prose items-start gap-4 rounded-3xl border border-ink-100 bg-white p-5">
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-cream-200 text-ink-700">
        <Link2 aria-hidden className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-ink">
          {fmt(t.firstShared, { platform })}
          {post.postedAt && fmt(t.on, { date: formatDate(post.postedAt, locale) })}
          {post.authorHandle && fmt(t.by, { handle: post.authorHandle })}
        </p>
        {post.creatorConfirmed ? (
          <p className="mt-1 flex items-start gap-2 text-teal-800">
            <BadgeCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
            {t.confirmed}
          </p>
        ) : (
          <p className="mt-1 text-ink-700">{t.donateHere}</p>
        )}
        {post.url && (
          <a
            href={post.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="mt-2 inline-flex min-h-11 items-center font-semibold text-teal-700 underline-offset-4 hover:underline"
          >
            {t.viewOriginal}
            <span className="sr-only">{messages.common.opensInNewTab}</span>
          </a>
        )}
      </div>
    </div>
  );
}
