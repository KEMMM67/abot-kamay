// apps/web/components/home/funding-types.tsx
//
// The two kinds of campaign creators can start: an exact goal, or ongoing help without one.
import { Infinity as InfinityIcon, Target } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { getMessages } from '@/lib/i18n/server';

const TYPES = [
  { key: 'fixed', icon: Target, tone: 'bg-gold-50 ring-gold-200' },
  { key: 'openEnded', icon: InfinityIcon, tone: 'bg-teal-50 ring-teal-100' },
] as const;

export async function FundingTypes() {
  const t = (await getMessages()).home.funding;
  return (
    <section aria-labelledby="funding-heading" className="py-16 sm:py-24">
      <div className="container-page">
        <SectionHeading
          id="funding-heading"
          eyebrow={t.eyebrow}
          title={t.title}
          description={t.description}
        />
        <ul className="mt-12 grid gap-6 md:grid-cols-2">
          {TYPES.map(({ key, icon: Icon, tone }) => {
            const { name, example, points } = t[key];
            return (
              <li key={key} className={`reveal rounded-3xl p-7 ring-1 ring-inset ${tone}`}>
                <div className="flex items-center gap-4">
                  <span className="grid size-14 place-items-center rounded-2xl bg-white text-teal-700 shadow-card">
                    <Icon aria-hidden className="size-7" />
                  </span>
                  <div>
                    <h3 className="text-xl font-bold text-ink">{name}</h3>
                    <p className="text-ink-700">{example}</p>
                  </div>
                </div>
                <ul className="mt-6 space-y-2.5">
                  {points.map((point) => (
                    <li key={point} className="flex gap-3 leading-relaxed text-ink-800">
                      <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-teal-600" />
                      {point}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
