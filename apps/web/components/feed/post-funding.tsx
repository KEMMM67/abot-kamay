// apps/web/components/feed/post-funding.tsx
//
// The money part of a post: raised so far, progress toward the goal (or "ongoing support" when there
// is none), donors, receipts and the "Help" cue. The whole card is the link, so "Help" is a visual cue,
// not a second link.
import { ReceiptText, Users } from 'lucide-react';
import { ArrowNudge } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { StatusChip } from '@/components/ui/status-chip';
import { cn } from '@/lib/cn';
import { fmt, plural, rich } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';
import { formatCount, formatPeso, fundingProgress } from '@/lib/money';
import type { CampaignSummary } from '@/lib/types';

export async function PostFunding({
  campaign,
  className,
}: {
  campaign: CampaignSummary;
  className?: string;
}) {
  const t = (await getMessages()).feed.post;
  const { raisedMinor, goalMinor } = campaign;
  const progress = goalMinor ? fundingProgress(raisedMinor, goalMinor) : null;
  const raised = rich(t.raised, {
    amount: <span className="text-lg font-bold text-ink">{formatPeso(raisedMinor)}</span>,
  });

  return (
    <div className={className}>
      {progress && goalMinor ? (
        <>
          <ProgressBar progress={progress} />
          <div className="mt-3 flex items-baseline justify-between gap-3">
            <p className="text-ink-700">{raised}</p>
            <p className={cn('font-bold', progress.complete ? 'text-teal-700' : 'text-ink')}>
              {progress.label}
              <span className="sr-only">{t.ofGoal}</span>
            </p>
          </div>
          <p className="mt-0.5 text-ink-600">{fmt(t.goal, { amount: formatPeso(goalMinor) })}</p>
        </>
      ) : (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-ink-700">{raised}</p>
          <StatusChip tone="gold">{t.ongoing}</StatusChip>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-100 pt-4 text-ink-600">
        <p className="flex items-center gap-1.5">
          <Users aria-hidden className="size-4" />
          {plural(t.donors, campaign.donorCount, { count: formatCount(campaign.donorCount) })}
        </p>
        <p className="flex items-center gap-1.5">
          <ReceiptText aria-hidden className="size-4" />
          {plural(t.receipts, campaign.receiptCount)}
        </p>
        <p aria-hidden className="ml-auto flex items-center gap-1.5 font-semibold text-teal-700">
          {t.help}
          <ArrowNudge className="size-5" />
        </p>
      </div>
    </div>
  );
}
