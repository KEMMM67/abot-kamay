// apps/web/components/feed/media-collage.tsx
//
// A post's photos the way social media shows them: one photo at its own shape (between 4:5 portrait
// and 1.91:1 landscape, like Instagram), two side by side, three as one large and two small, four as
// a grid, and "+N" on the last tile when the post has more. A video among the photos shows its poster
// with a play mark; it plays on the campaign page. Pure layout: no JavaScript.
import { Play } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/cn';
import { fmt } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';
import type { PublicMedia } from '@/lib/types';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Width / height of a post's frame: a portrait phone video up to 9:16, photos within Instagram's range
 * (4:5 to 1.91:1). Unknown sizes (older files) get the most common shape for their kind.
 */
export function frameRatio(media: PublicMedia): number {
  const natural = media.width && media.height ? media.width / media.height : null;
  if (media.kind === 'VIDEO') return natural ? clamp(natural, 9 / 16, 16 / 9) : 9 / 16;
  return natural ? clamp(natural, 4 / 5, 1.91) : 4 / 3;
}

/** Tile placement for 2, 3 and 4 items. */
const GRIDS: Record<number, { frame: string; tiles: readonly string[] }> = {
  2: { frame: 'aspect-4/3 grid-cols-2', tiles: ['', ''] },
  3: { frame: 'aspect-4/3 grid-cols-2 grid-rows-2', tiles: ['row-span-2', '', ''] },
  4: { frame: 'aspect-square grid-cols-2 grid-rows-2', tiles: ['', '', '', ''] },
};

export async function MediaCollage({
  media,
  more,
  alias,
  priority = false,
  className,
}: {
  /** Up to four items, in the creator's order. */
  media: readonly PublicMedia[];
  /** Items beyond these, shown as "+N". */
  more: number;
  alias: string;
  priority?: boolean;
  className?: string;
}) {
  const t = await getMessages();
  const describe = (item: PublicMedia) =>
    item.altText ?? fmt(item.kind === 'VIDEO' ? t.media.videoAbout : t.media.photoOf, { alias });

  const tile = (item: PublicMedia, index: number, sizes: string, extra = '') => {
    const image = item.kind === 'VIDEO' ? item.posterUrl : item.url;
    const isLast = index === media.length - 1;
    return (
      <div key={item.id} className={cn('relative overflow-hidden bg-cream-200', extra)}>
        {image ? (
          <Image
            src={image}
            alt={describe(item)}
            fill
            sizes={sizes}
            priority={priority && index === 0}
            className="object-cover"
          />
        ) : (
          <span className="absolute inset-0 bg-ink">
            <span className="sr-only">{describe(item)}</span>
          </span>
        )}
        {item.kind === 'VIDEO' && (
          <span
            aria-hidden
            className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-ink/75 px-2.5 py-1 text-sm font-semibold text-white"
          >
            <Play className="size-3.5" fill="currentColor" />
            {t.media.video}
          </span>
        )}
        {isLast && more > 0 && (
          <span className="absolute inset-0 grid place-items-center bg-ink/55 text-3xl font-bold text-white">
            {fmt(t.feed.post.moreMedia, { count: more })}
          </span>
        )}
      </div>
    );
  };

  const first = media[0];
  if (!first) return null;

  if (media.length === 1) {
    return (
      <div style={{ aspectRatio: String(frameRatio(first)) }} className={cn('relative w-full', className)}>
        {tile(first, 0, '(min-width: 1024px) 40rem, 100vw', 'absolute inset-0')}
      </div>
    );
  }

  const grid = GRIDS[Math.min(media.length, 4)] ?? GRIDS[4];
  return (
    <figure
      aria-label={fmt(t.feed.post.mediaLabel, { alias })}
      className={cn('grid w-full gap-0.5 bg-white', grid?.frame, className)}
    >
      {media
        .slice(0, 4)
        .map((item, index) => tile(item, index, '(min-width: 1024px) 20rem, 50vw', grid?.tiles[index]))}
    </figure>
  );
}
