// apps/web/components/feed/feed-aside.tsx
//
// Beside (desktop) or between (phones) the feed posts: the invitation to post someone in need, and
// the short version of why the feed can be trusted.
import { BadgeCheck, Camera, ReceiptText, ScrollText, ShieldCheck, type LucideIcon } from 'lucide-react';
import { ArrowNudge, ButtonLink } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { getMessages } from '@/lib/i18n/server';

export async function ComposerPrompt({ className }: { className?: string }) {
  const t = (await getMessages()).feed.composer;
  return (
    <div className={cn('rounded-3xl border border-teal-200 bg-teal-50/70 p-5 sm:p-6', className)}>
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-teal-600 text-white shadow-cta">
          <Camera aria-hidden className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="text-lg font-bold text-ink">{t.title}</p>
          <p className="mt-1 leading-relaxed text-ink-700">{t.body}</p>
        </div>
      </div>
      <ButtonLink href="/mag-post" className="mt-4 w-full">
        {t.button}
        <ArrowNudge className="size-5" />
      </ButtonLink>
    </div>
  );
}

const TRUST_ICONS: readonly LucideIcon[] = [BadgeCheck, ShieldCheck, ReceiptText, ScrollText];

export async function FeedTrust({ className }: { className?: string }) {
  const t = (await getMessages()).feed.trust;
  return (
    <section
      aria-labelledby="feed-trust-heading"
      className={cn('rounded-3xl border border-ink-100 bg-white p-5 sm:p-6', className)}
    >
      <h2 id="feed-trust-heading" className="text-lg font-bold text-ink">
        {t.title}
      </h2>
      <ul className="mt-4 space-y-4">
        {t.points.map(({ title, body }, index) => {
          const Icon = TRUST_ICONS[index] ?? ShieldCheck;
          return (
            <li key={title} className="flex gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
                <Icon aria-hidden className="size-5" />
              </span>
              <span>
                <span className="block font-semibold text-ink">{title}</span>
                <span className="block text-ink-600">{body}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
