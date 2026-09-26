// apps/web/components/campaigns/donate-panel.tsx
'use client';

import { HandHeart, Infinity as InfinityIcon, ReceiptText, ScrollText, ShieldCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import { StatusChip } from '@/components/ui/status-chip';
import { ButtonLink, buttonClasses } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { acceptsDonations } from '@/lib/format';
import { useMessages } from '@/lib/i18n/client';
import { fmt, rich } from '@/lib/i18n/format';
import { formatCount, formatPeso, fundingProgress } from '@/lib/money';
import type { CampaignStatus, FundingType } from '@/lib/types';
import { DonationDialog } from './donation-dialog';
import { ShareLink } from './share-link';

export interface DonatePanelCampaign {
  id: string;
  slug: string;
  title: string;
  beneficiaryAlias: string;
  status: CampaignStatus;
  fundingType: FundingType;
  /** Null for OPEN_ENDED campaigns. */
  goalMinor: string | null;
  raisedMinor: string;
  donorCount: number;
  receiptCount: number;
}

const ASSURANCE_ICONS = [ShieldCheck, ReceiptText, ScrollText] as const;

/**
 * Funding progress and the Donate call to action. On large screens the card sticks beside the story.
 * On phones the Donate button becomes a bar fixed to the bottom of the screen, so it is always one
 * tap away. It stays a single button element either way (the E2E suite finds it by data-testid).
 * No ancestor of that bar may use transform, filter or backdrop-filter, or position: fixed would
 * attach to the ancestor instead of the screen.
 */
export function DonatePanel({ campaign }: { campaign: DonatePanelCampaign }) {
  const t = useMessages().donate;
  const [dialogOpen, setDialogOpen] = useState(false);
  const donateRef = useRef<HTMLButtonElement>(null);
  const progress = campaign.goalMinor ? fundingProgress(campaign.raisedMinor, campaign.goalMinor) : null;
  const open = acceptsDonations(campaign.status);

  return (
    <section aria-labelledby="donate-heading" className="lg:sticky lg:top-28">
      <div className="animate-fade-in rounded-3xl border border-ink-100 bg-white p-6 shadow-card sm:p-7">
        <h2 id="donate-heading" className="sr-only">
          {fmt(t.heading, { alias: campaign.beneficiaryAlias })}
        </h2>
        <p className="text-4xl font-extrabold tracking-tight tabular-nums text-ink">
          {formatPeso(campaign.raisedMinor)}
        </p>
        {progress && campaign.goalMinor ? (
          <>
            <p className="mt-1 text-ink-700">
              {rich(t.raisedOfGoal, {
                goal: <span className="font-semibold text-ink">{formatPeso(campaign.goalMinor)}</span>,
              })}
            </p>
            <ProgressBar progress={progress} size="lg" className="mt-5" />
          </>
        ) : (
          <>
            <p className="mt-1 text-ink-700">{t.raisedSoFar}</p>
            <StatusChip tone="gold" className="mt-4">
              <InfinityIcon aria-hidden />
              {t.ongoingNoGoal}
            </StatusChip>
          </>
        )}
        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-ink-100 pt-5">
          <div>
            <dt className="text-sm font-semibold text-ink-600">{t.donors}</dt>
            <dd className="mt-0.5 text-2xl font-bold tabular-nums text-ink">
              {formatCount(campaign.donorCount)}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-ink-600">{progress ? t.reached : t.receipts}</dt>
            <dd className="mt-0.5 text-2xl font-bold tabular-nums text-ink">
              {progress ? progress.label : formatCount(campaign.receiptCount)}
            </dd>
          </div>
        </dl>

        {/* Phones: fixed to the bottom of the screen. Large screens: part of this card. */}
        <div
          data-sticky-cta
          className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-100 bg-white px-4 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3.5 shadow-sheet lg:static lg:z-auto lg:mt-6 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
        >
          <div className="mx-auto flex max-w-xl items-center gap-4 lg:block lg:max-w-none">
            <div aria-hidden className="min-w-0 flex-1 lg:hidden">
              <p className="truncate font-bold text-ink">
                {fmt(t.barRaised, { amount: formatPeso(campaign.raisedMinor) })}
              </p>
              <p className="truncate text-sm text-ink-600">
                {progress && campaign.goalMinor
                  ? fmt(t.barProgress, { label: progress.label, goal: formatPeso(campaign.goalMinor) })
                  : t.barOngoing}
              </p>
            </div>
            {open ? (
              <button
                ref={donateRef}
                type="button"
                data-testid="donate-button"
                aria-haspopup="dialog"
                onClick={() => setDialogOpen(true)}
                className={buttonClasses({ size: 'lg', className: 'shrink-0 px-6 lg:w-full' })}
              >
                <HandHeart aria-hidden />
                {t.donate}
                <span className="hidden lg:inline">{t.donateNow}</span>
              </button>
            ) : (
              <ButtonLink href="/campaigns" variant="secondary" size="lg" className="shrink-0 lg:w-full">
                {t.findOthers}
              </ButtonLink>
            )}
          </div>
        </div>

        <ul className="mt-6 space-y-3">
          {t.assurances.map((text, index) => {
            const Icon = ASSURANCE_ICONS[index] ?? ShieldCheck;
            return (
              <li key={text} className="flex items-start gap-3 text-ink-700">
                <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-teal-600" />
                {text}
              </li>
            );
          })}
        </ul>

        <ShareLink slug={campaign.slug} title={campaign.title} className="mt-6" />
      </div>

      {open && (
        <DonationDialog
          open={dialogOpen}
          onClose={() => {
            setDialogOpen(false);
            donateRef.current?.focus();
          }}
          campaign={{ id: campaign.id, beneficiaryAlias: campaign.beneficiaryAlias }}
        />
      )}
    </section>
  );
}
