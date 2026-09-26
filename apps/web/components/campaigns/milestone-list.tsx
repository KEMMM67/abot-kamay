// apps/web/components/campaigns/milestone-list.tsx
//
// How the money will be used, as the creator planned it. Items of an open-ended campaign may have no
// amount; every item says who gets paid (the creator, who then posts receipts, or the hospital or
// store directly).
import { StatusChip } from '@/components/ui/status-chip';
import { milestoneStatus } from '@/lib/format';
import { fmt } from '@/lib/i18n/format';
import { getLocale, getMessages } from '@/lib/i18n/server';
import { formatPeso } from '@/lib/money';
import type { Milestone } from '@/lib/types';

export async function MilestoneList({ milestones }: { milestones: Milestone[] }) {
  const [t, locale] = await Promise.all([getMessages(), getLocale()]);
  return (
    <ol className="space-y-3">
      {milestones.map((milestone) => {
        const status = milestoneStatus(milestone, t.labels.milestoneStatus, locale);
        return (
          <li
            key={milestone.id}
            className="flex gap-4 rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-6"
          >
            <span
              aria-hidden
              className="grid size-10 shrink-0 place-items-center rounded-2xl bg-cream-200 font-bold text-ink-800"
            >
              {milestone.position}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <h3 className="font-bold text-ink">
                  <span className="sr-only">
                    {fmt(t.campaign.milestone.srPrefix, { number: milestone.position })}
                  </span>
                  {milestone.title}
                </h3>
                <p className="text-lg font-bold tabular-nums text-ink">
                  {milestone.budgetMinor ? (
                    formatPeso(milestone.budgetMinor)
                  ) : (
                    <span className="text-base font-semibold text-ink-600">
                      {t.campaign.milestone.noFixedAmount}
                    </span>
                  )}
                </p>
              </div>
              {milestone.description && (
                <p className="mt-1 leading-relaxed text-ink-700">{milestone.description}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <StatusChip tone={status.tone}>{status.label}</StatusChip>
                <span className="text-ink-600">{t.labels.payouts[milestone.payoutMethod]}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
