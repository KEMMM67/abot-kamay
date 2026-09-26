// apps/web/components/creator/flow-steps.tsx
//
// The three steps to a post: sign in, verify the ID, create the post. Each step is shown by an icon
// and a text label as well as color (WCAG 1.4.1), and the current one is marked with aria-current.
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { getMessages } from '@/lib/i18n/server';

export async function FlowSteps({ current }: { current: 1 | 2 | 3 }) {
  const t = (await getMessages()).creator.steps;
  return (
    <ol aria-label={t.label} className="grid grid-cols-3 gap-2 sm:gap-4">
      {t.items.map((step, index) => {
        const number = index + 1;
        const done = number < current;
        const active = number === current;
        return (
          <li
            key={step.title}
            aria-current={active ? 'step' : undefined}
            className={cn(
              'flex flex-col gap-2 rounded-2xl border p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4',
              active ? 'border-teal-600 bg-white shadow-card' : 'border-ink-100 bg-white/60',
            )}
          >
            <span
              className={cn(
                'grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold',
                done && 'bg-teal-600 text-white',
                active && 'bg-gold-400 text-ink',
                !done && !active && 'border-2 border-dashed border-ink-300 text-ink-600',
              )}
            >
              {done ? <Check aria-hidden className="size-5" strokeWidth={3} /> : number}
            </span>
            <span className="min-w-0">
              <span
                className={cn('block font-bold leading-tight', active || done ? 'text-ink' : 'text-ink-600')}
              >
                {step.title}
              </span>
              <span className="hidden text-sm text-ink-600 sm:block">{step.note}</span>
              <span className="sr-only">{done ? t.done : active ? t.current : t.upcoming}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
