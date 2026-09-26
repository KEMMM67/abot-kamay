// apps/web/components/home/how-it-works.tsx
import { Camera, ReceiptText, UserCheck, type LucideIcon } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { fmt } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';

const STEP_ICONS: readonly LucideIcon[] = [UserCheck, Camera, ReceiptText];

export async function HowItWorks() {
  const t = (await getMessages()).home.how;
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-heading"
      className="border-y border-ink-100 bg-white py-16 sm:py-24"
    >
      <div className="container-page">
        <SectionHeading id="how-heading" eyebrow={t.eyebrow} title={t.title} description={t.description} />
        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {t.steps.map(({ title, body }, index) => {
            const Icon = STEP_ICONS[index] ?? UserCheck;
            return (
              <li key={title} className="reveal rounded-3xl border border-ink-100 bg-cream-50 p-7">
                <div className="flex items-center gap-4">
                  <span className="grid size-14 place-items-center rounded-2xl bg-teal-600 text-white shadow-cta">
                    <Icon aria-hidden className="size-7" />
                  </span>
                  <span className="text-sm font-bold uppercase tracking-[0.14em] text-teal-700">
                    {fmt(t.step, { number: index + 1 })}
                  </span>
                </div>
                <h3 className="mt-6 text-xl font-bold text-ink">{title}</h3>
                <p className="mt-2 leading-relaxed text-ink-700">{body}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
