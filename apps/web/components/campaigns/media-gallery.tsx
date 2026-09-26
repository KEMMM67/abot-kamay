// apps/web/components/campaigns/media-gallery.tsx
//
// The post's photos and videos, swipeable on phones (CSS scroll snap, no JavaScript). Without public
// media, the illustrated need panel stands in.
import { cn } from '@/lib/cn';
import { fmt } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';
import type { NeedCategory, PublicMedia } from '@/lib/types';
import { PostMedia } from './post-media';

export async function MediaGallery({
  media,
  needs,
  alias,
  className,
}: {
  media: PublicMedia[];
  needs: readonly NeedCategory[];
  alias: string;
  className?: string;
}) {
  const t = (await getMessages()).media;
  if (media.length <= 1) {
    return (
      <PostMedia
        media={media[0] ?? null}
        needs={needs}
        alias={alias}
        size="hero"
        interactive
        priority
        sizes="(min-width: 1024px) 48rem, 100vw"
        className={cn('aspect-4/3 rounded-3xl sm:aspect-16/9', className)}
      />
    );
  }

  return (
    <section aria-label={fmt(t.galleryLabel, { count: media.length })} className={className}>
      <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain rounded-3xl pb-2 [scrollbar-width:thin]">
        {media.map((item, index) => (
          <li key={item.id} className="w-[88%] shrink-0 snap-center sm:w-[80%]">
            <PostMedia
              media={item}
              needs={needs}
              alias={alias}
              interactive
              priority={index === 0}
              sizes="(min-width: 1024px) 40rem, 88vw"
              className="aspect-4/3 rounded-3xl"
            />
            <p className="mt-2 text-sm text-ink-600">
              {fmt(t.position, { index: index + 1, total: media.length })}
              {item.altText && <> · {item.altText}</>}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
