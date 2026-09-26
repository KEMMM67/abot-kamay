// apps/web/components/home/creator-cta.tsx
//
// The invitation to post, with what it takes, stated up front: a government ID, the person's consent,
// and receipts for every expense.
import { Camera, HandHeart, IdCard, ReceiptText, type LucideIcon } from 'lucide-react';
import { ArrowNudge, ButtonLink } from '@/components/ui/button';
import { getMessages } from '@/lib/i18n/server';

const NEED_ICONS: readonly LucideIcon[] = [IdCard, HandHeart, ReceiptText];

export async function CreatorCta() {
  const t = (await getMessages()).home.creatorCta;
  return (
    <section aria-labelledby="creator-heading" className="pb-16 sm:pb-24">
      <div className="container-page">
        <div className="reveal grid items-center gap-10 rounded-[2rem] border border-teal-200 bg-teal-50/70 px-6 py-12 sm:px-12 lg:grid-cols-[1.1fr_0.9fr] lg:px-16">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-teal-700">{t.eyebrow}</p>
            <h2
              id="creator-heading"
              className="mt-3 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl"
            >
              {t.title}
            </h2>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-700">{t.body}</p>
            <ButtonLink href="/mag-post" size="lg" className="mt-8">
              <Camera aria-hidden />
              {t.button}
              <ArrowNudge className="size-5" />
            </ButtonLink>
          </div>
          <div>
            <p className="font-bold text-ink">{t.needsTitle}</p>
            <ul className="mt-4 space-y-3">
              {t.needs.map((text, index) => {
                const Icon = NEED_ICONS[index] ?? IdCard;
                return (
                  <li key={text} className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-card">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal-600 text-white">
                      <Icon aria-hidden className="size-5" />
                    </span>
                    <span className="font-semibold text-ink">{text}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
