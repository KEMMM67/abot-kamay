// apps/web/components/campaigns/verification-timeline.tsx
//
// Every step from the creator's ID check to the last receipt. State is shown by icon shape
// and a text label as well as color, so it never depends on color alone (WCAG 1.4.1).
import { Check, Clock } from 'lucide-react';
import { cn, type StyleWithVars } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { getLocale, getMessages } from '@/lib/i18n/server';
import type { TimelineEvent, TimelineState } from '@/lib/types';

function StepMarker({ state }: { state: TimelineState }) {
  if (state === 'DONE') {
    return (
      <span className="relative z-10 grid size-10 shrink-0 place-items-center rounded-full bg-teal-600 text-white shadow-cta">
        <Check aria-hidden className="size-5" strokeWidth={3} />
      </span>
    );
  }
  if (state === 'CURRENT') {
    return (
      <span className="relative z-10 grid size-10 shrink-0 place-items-center rounded-full bg-gold-400 text-ink">
        <span aria-hidden className="animate-pulse-ring absolute inset-0 rounded-full bg-gold-400" />
        <Clock aria-hidden className="relative size-5" strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span className="relative z-10 grid size-10 shrink-0 place-items-center rounded-full border-2 border-dashed border-ink-300 bg-white">
      <span aria-hidden className="size-2 rounded-full bg-ink-300" />
    </span>
  );
}

export async function VerificationTimeline({ events }: { events: TimelineEvent[] }) {
  const [t, locale] = await Promise.all([getMessages(), getLocale()]);
  const stateText = t.campaign.timelineStates;
  return (
    <ol data-testid="verification-timeline" className="relative">
      {events.map((event, index) => {
        const isLast = index === events.length - 1;
        return (
          <li
            key={event.id}
            style={{ '--i': index, '--stagger-step': '60ms' } as StyleWithVars}
            className="animate-fade-up stagger relative flex gap-4 pb-8 last:pb-0"
          >
            {!isLast && (
              <span
                aria-hidden
                style={{ '--i': index, '--stagger-step': '60ms' } as StyleWithVars}
                className={cn(
                  'animate-grow-y stagger absolute bottom-0 left-5 top-10 w-0.5 origin-top -translate-x-1/2',
                  event.state === 'DONE' ? 'bg-teal-500' : 'bg-ink-200',
                )}
              />
            )}
            <StepMarker state={event.state} />
            <div className="min-w-0 pt-1.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className={cn('font-bold', event.state === 'UPCOMING' ? 'text-ink-600' : 'text-ink')}>
                  {event.title}
                </p>
                {event.state === 'CURRENT' ? (
                  <span className="rounded-full bg-gold-100 px-2.5 py-0.5 text-sm font-semibold text-gold-800">
                    {stateText.CURRENT}
                  </span>
                ) : (
                  <span className="sr-only">({stateText[event.state]})</span>
                )}
              </div>
              {event.occurredAt && (
                <p className="text-ink-600">
                  <time dateTime={event.occurredAt}>{formatDate(event.occurredAt, locale)}</time>
                </p>
              )}
              <p className="mt-1 leading-relaxed text-ink-700">{event.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
