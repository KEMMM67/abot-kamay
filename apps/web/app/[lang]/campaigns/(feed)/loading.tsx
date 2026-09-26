// apps/web/app/[lang]/campaigns/(feed)/loading.tsx
import { getMessages } from '@/lib/i18n/server';

/**
 * Skeleton for the feed: the same shapes as the real posts (a tall video post, then a photo post) and
 * the sidebar, so nothing jumps when they arrive.
 */
export default async function FeedLoading() {
  const t = (await getMessages()).feed;
  return (
    <div className="container-page pb-20 pt-8 sm:pt-12">
      <p className="sr-only">{t.loading}</p>
      <div
        aria-hidden
        className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,40rem)_minmax(0,22rem)] lg:justify-between"
      >
        <div>
          <div className="skeleton animate-shimmer h-4 w-40 rounded-lg" />
          <div className="skeleton animate-shimmer mt-4 h-12 w-full max-w-xl rounded-lg" />
          <div className="skeleton animate-shimmer mt-4 h-5 w-full max-w-lg rounded-lg" />
          <ul className="mt-12 space-y-6">
            <li className="overflow-hidden rounded-3xl border border-ink-100 bg-white">
              <div className="skeleton animate-shimmer aspect-9/16 max-h-[78svh] w-full" />
              <div className="space-y-3 p-5">
                <div className="skeleton animate-shimmer h-6 w-11/12 rounded-lg" />
                <div className="skeleton animate-shimmer h-5 w-7/12 rounded-lg" />
                <div className="skeleton animate-shimmer mt-6 h-2.5 w-full rounded-full" />
              </div>
            </li>
            {Array.from({ length: 2 }, (_, index) => (
              <li key={index} className="overflow-hidden rounded-3xl border border-ink-100 bg-white">
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <div className="skeleton animate-shimmer size-11 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton animate-shimmer h-4 w-32 rounded-lg" />
                    <div className="skeleton animate-shimmer h-3 w-48 rounded-lg" />
                  </div>
                </div>
                <div className="space-y-2 px-5 pb-4">
                  <div className="skeleton animate-shimmer h-6 w-10/12 rounded-lg" />
                  <div className="skeleton animate-shimmer h-4 w-full rounded-lg" />
                </div>
                <div className="skeleton animate-shimmer aspect-4/3" />
                <div className="space-y-3 p-5">
                  <div className="skeleton animate-shimmer h-2.5 w-full rounded-full" />
                  <div className="skeleton animate-shimmer h-5 w-1/2 rounded-lg" />
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="hidden space-y-6 lg:block">
          <div className="skeleton animate-shimmer h-56 rounded-3xl" />
          <div className="skeleton animate-shimmer h-80 rounded-3xl" />
        </div>
      </div>
    </div>
  );
}
