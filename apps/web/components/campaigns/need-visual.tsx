// apps/web/components/campaigns/need-visual.tsx
//
// Illustrated panel for a campaign, keyed to its main need. Beneficiary photos appear only with
// recorded consent (brand dignity policy), so the default visual is an icon on a brand tint rather
// than a stock or AI-generated face.
import {
  Accessibility,
  GraduationCap,
  HandHeart,
  HeartPulse,
  House,
  Soup,
  Store,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { getMessages } from '@/lib/i18n/server';
import type { NeedCategory } from '@/lib/types';

const NEEDS: Record<NeedCategory, { icon: LucideIcon; panel: string; iconColor: string }> = {
  MOBILITY: {
    icon: Accessibility,
    panel: 'from-teal-50 via-teal-100 to-teal-200/70',
    iconColor: 'text-teal-700',
  },
  MEDICAL: {
    icon: HeartPulse,
    panel: 'from-coral-50 via-coral-100 to-coral-200/60',
    iconColor: 'text-coral-600',
  },
  LIVELIHOOD: { icon: Store, panel: 'from-gold-50 via-gold-100 to-gold-200/70', iconColor: 'text-gold-700' },
  HOUSING: { icon: House, panel: 'from-cream-100 via-cream-200 to-cream-300', iconColor: 'text-ink-700' },
  FOOD: { icon: Soup, panel: 'from-gold-50 via-cream-200 to-gold-100', iconColor: 'text-gold-700' },
  EDUCATION: {
    icon: GraduationCap,
    panel: 'from-teal-50 via-cream-100 to-teal-100',
    iconColor: 'text-teal-700',
  },
};

const FALLBACK = {
  icon: HandHeart,
  panel: 'from-cream-100 via-cream-200 to-teal-50',
  iconColor: 'text-teal-700',
};

export async function NeedVisual({
  needs,
  size = 'card',
  className,
}: {
  needs: readonly NeedCategory[];
  size?: 'card' | 'hero';
  className?: string;
}) {
  const labels = (await getMessages()).labels.needs;
  const primary = needs[0];
  const { icon: Icon, panel, iconColor } = (primary && NEEDS[primary]) || FALLBACK;
  const hero = size === 'hero';

  return (
    <div className={cn('relative isolate overflow-hidden bg-linear-to-br', panel, className)}>
      <div aria-hidden className="dot-grid absolute inset-0 opacity-70" />
      <div aria-hidden className="absolute -right-10 -top-12 size-48 rounded-full bg-white/50 blur-2xl" />
      <div aria-hidden className="absolute -bottom-16 -left-10 size-44 rounded-full bg-white/40 blur-2xl" />
      <span
        aria-hidden
        className={cn(
          'absolute grid place-items-center rounded-3xl bg-white shadow-card ring-1 ring-ink/5 transition-transform duration-500 ease-out-expo group-hover:-rotate-3 group-hover:scale-105',
          hero ? 'right-6 top-6 size-20 sm:right-8 sm:top-8 sm:size-24' : 'right-5 top-5 size-14',
          iconColor,
        )}
      >
        <Icon className={hero ? 'size-10 sm:size-12' : 'size-7'} strokeWidth={1.75} />
      </span>
      <ul
        className={cn(
          'absolute flex flex-wrap gap-2',
          hero ? 'bottom-6 left-6 sm:bottom-8 sm:left-8' : 'bottom-4 left-4',
        )}
      >
        {needs.map((need) => (
          <li
            key={need}
            className="rounded-full bg-white/90 px-3 py-1 text-sm font-semibold text-ink-800 shadow-sm backdrop-blur"
          >
            {labels[need] ?? need}
          </li>
        ))}
      </ul>
    </div>
  );
}
