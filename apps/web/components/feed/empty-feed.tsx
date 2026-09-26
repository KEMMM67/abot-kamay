// apps/web/components/feed/empty-feed.tsx
//
// What the feed and the landing page show before the first post is published: an invitation, not an
// apology. Posts appear only after a person reviews them, so a new platform starts empty.
import { Camera, ShieldCheck } from 'lucide-react';
import { LogoMark } from '@/components/brand/logo';
import { ArrowNudge, ButtonLink } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { getMessages } from '@/lib/i18n/server';

export async function EmptyFeed({
  headingLevel = 'h2',
  className,
}: {
  headingLevel?: 'h2' | 'h3';
  className?: string;
}) {
  const t = (await getMessages()).feed.empty;
  const Heading = headingLevel;
  return (
    <section
      aria-labelledby="empty-feed-heading"
      className={cn(
        'animate-fade-up relative isolate overflow-hidden rounded-3xl border-2 border-dashed border-teal-200 bg-white px-6 py-12 text-center sm:px-10 sm:py-14',
        className,
      )}
    >
      <div
        aria-hidden
        className="absolute -top-24 left-1/2 -z-10 size-[26rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(208_239_232/0.8),transparent)]"
      />
      <span
        aria-hidden
        className="relative mx-auto grid size-24 place-items-center rounded-full bg-cream shadow-card"
      >
        <LogoMark animated className="size-14" />
        <span className="absolute -bottom-1 -right-1 grid size-9 place-items-center rounded-full bg-teal-600 text-white ring-4 ring-white">
          <Camera className="size-4.5" />
        </span>
      </span>
      <Heading
        id="empty-feed-heading"
        className="mx-auto mt-6 max-w-md text-2xl font-extrabold tracking-tight text-ink sm:text-3xl"
      >
        {t.title}
      </Heading>
      <p className="mx-auto mt-3 max-w-lg text-lg leading-relaxed text-ink-700">{t.body}</p>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <ButtonLink href="/mag-post" size="lg">
          <Camera aria-hidden />
          {t.primary}
          <ArrowNudge className="size-5" />
        </ButtonLink>
        <ButtonLink href="/#how-it-works" size="lg" variant="secondary">
          <ShieldCheck aria-hidden />
          {t.secondary}
        </ButtonLink>
      </div>
    </section>
  );
}
