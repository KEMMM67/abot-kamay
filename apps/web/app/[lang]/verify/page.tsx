// apps/web/app/[lang]/verify/page.tsx
//
// "Legit ba 'to?": check a GCash or Maya number seen in the comments of a viral post before sending
// money. No account needed.
import { KeyRound, MessageSquareWarning, ShieldCheck, type LucideIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { PageTransition } from '@/components/page-transition';
import { TrustChecker } from '@/components/verify/trust-checker';
import { officialShortLink } from '@/lib/config';
import { fmt } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getMessages()).verify;
  return { title: t.metaTitle, description: t.metaDescription, alternates: { canonical: '/verify' } };
}

const TIP_ICONS: readonly LucideIcon[] = [ShieldCheck, MessageSquareWarning, KeyRound];

export default async function VerifyPage() {
  const t = (await getMessages()).verify;
  const prefix = officialShortLink('').display;

  return (
    <PageTransition>
      <div className="container-page pb-20 pt-10 sm:pt-16">
        <header className="mx-auto max-w-2xl text-center">
          <span className="animate-pop mx-auto grid size-16 place-items-center rounded-3xl bg-teal-600 text-white shadow-cta">
            <ShieldCheck aria-hidden className="size-8" />
          </span>
          <h1 className="animate-fade-up mt-6 text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
            {t.title}
          </h1>
          <p className="animate-fade-up animation-delay-100 mt-4 text-lg leading-relaxed text-ink-700 sm:text-xl">
            {t.intro}
          </p>
        </header>

        <div className="mt-10">
          <TrustChecker />
        </div>

        <section aria-labelledby="tips-heading" className="mx-auto mt-16 max-w-2xl">
          <h2 id="tips-heading" className="text-2xl font-extrabold tracking-tight text-ink">
            {t.tipsHeading}
          </h2>
          <ul className="mt-6 space-y-4">
            {t.tips.map(({ title, body }, index) => {
              const Icon = TIP_ICONS[index] ?? ShieldCheck;
              return (
                <li key={title} className="reveal flex gap-4 rounded-3xl border border-ink-100 bg-white p-5">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-teal-50 text-teal-700">
                    <Icon aria-hidden className="size-6" />
                  </span>
                  <div>
                    <h3 className="font-bold text-ink">{title}</h3>
                    <p className="mt-1 leading-relaxed text-ink-700">{fmt(body, { prefix })}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </PageTransition>
  );
}
