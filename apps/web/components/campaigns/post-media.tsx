// apps/web/components/campaigns/post-media.tsx
//
// A post's photo or video from the media CDN: the copies the media worker made (re-encoded, every piece
// of metadata removed, H.264 MP4 for video). Posts without public media yet show the need illustration
// instead: the dignity policy never allows stock or AI-generated faces in place of a real person.
// In cards (not interactive) a video shows its poster with a play mark; on the campaign page it plays
// with controls.
import { Play } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/cn';
import { fmt } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';
import type { NeedCategory, PublicMedia } from '@/lib/types';
import { NeedVisual } from './need-visual';

export async function PostMedia({
  media,
  needs,
  alias,
  sizes,
  priority = false,
  size = 'card',
  interactive = false,
  className,
}: {
  media: PublicMedia | null;
  needs: readonly NeedCategory[];
  alias: string;
  sizes: string;
  priority?: boolean;
  size?: 'card' | 'hero';
  /** Video controls; off in cards, where the whole card is one link. */
  interactive?: boolean;
  className?: string;
}) {
  if (!media) return <NeedVisual needs={needs} size={size} className={className} />;
  const t = (await getMessages()).media;

  if (media.kind === 'VIDEO') {
    const label = media.altText ?? fmt(t.videoAbout, { alias });
    const badge = (
      <span
        aria-hidden
        className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-ink/80 px-2.5 py-1 text-sm font-semibold text-white"
      >
        <Play className="size-3.5" fill="currentColor" />
        {t.video}
      </span>
    );
    if (!interactive) {
      return (
        <div className={cn('relative overflow-hidden bg-ink', className)}>
          {media.posterUrl ? (
            <Image
              src={media.posterUrl}
              alt={label}
              fill
              sizes={sizes}
              priority={priority}
              className="object-cover"
            />
          ) : (
            <span className="sr-only">{label}</span>
          )}
          {badge}
        </div>
      );
    }
    return (
      <div className={cn('relative overflow-hidden bg-ink', className)}>
        {/* Creator videos have no caption file yet: the media pipeline is to add WebVTT from speech-to-text
            (TECHNICAL_PLAN.md 2.9). Until then the post's description and caption are the text alternative. */}
        {/* oxlint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          src={media.url}
          poster={media.posterUrl ?? undefined}
          controls
          playsInline
          preload="metadata"
          aria-label={label}
          className="size-full object-contain"
        />
      </div>
    );
  }

  return (
    <div className={cn('relative overflow-hidden bg-cream-200', className)}>
      <Image
        src={media.url}
        alt={media.altText ?? fmt(t.photoOf, { alias })}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
      />
    </div>
  );
}
