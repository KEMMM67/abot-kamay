// apps/web/components/campaigns/creator-badge.tsx
//
// "Never a bare checkmark" (TECHNICAL_PLAN.md 1.3): the badge says who posted, that their government
// ID was verified and when, how they know the person, and expands to show everything AbotKamay
// checked. A native <details> works without JavaScript and announces its state to screen readers.
// data-testid="verification-badge" is part of the QA contract (qa/e2e-selenium CampaignPage): its
// text must contain "verified" in both languages.
import { BadgeCheck, Check, ChevronDown, ShieldCheck } from 'lucide-react';
import { CreatorAvatar } from '@/components/feed/creator-avatar';
import { formatDate, formatRate } from '@/lib/format';
import { fmt, plural } from '@/lib/i18n/format';
import { getLocale, getMessages } from '@/lib/i18n/server';
import type { CampaignDetail } from '@/lib/types';

export async function CreatorBadge({ campaign }: { campaign: CampaignDetail }) {
  const [messages, locale] = await Promise.all([getMessages(), getLocale()]);
  const t = messages.campaign.badge;
  const { creator, coordinator, verificationChecks } = campaign;
  const relationship = messages.labels.relationships[creator.relationship].badge;
  const tier = coordinator ? messages.labels.tiers[coordinator.tier] : null;
  const rate = coordinator ? formatRate(coordinator.proofComplianceRate) : null;

  return (
    <details className="group/badge rounded-3xl border border-teal-200 bg-teal-50/70 transition-colors open:bg-white open:shadow-card">
      <summary
        data-testid="verification-badge"
        className="flex cursor-pointer list-none items-center gap-4 rounded-3xl p-4 sm:p-5 [&::-webkit-details-marker]:hidden"
      >
        <span className="relative">
          <CreatorAvatar name={creator.displayName} className="size-12" />
          <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full bg-teal-600 text-white ring-2 ring-white">
            <ShieldCheck aria-hidden className="size-3.5" />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-bold text-ink">
            {fmt(t.title, { name: creator.displayName })}
          </span>
          <span className="block text-ink-700">
            {creator.kycVerifiedAt
              ? fmt(t.verifiedOn, { date: formatDate(creator.kycVerifiedAt, locale) })
              : t.verifiedCreator}
            {' · '}
            {relationship}
          </span>
        </span>
        <span className="hidden items-center gap-1 font-semibold text-teal-800 sm:inline-flex">
          <span className="group-open/badge:hidden">{t.showChecks}</span>
          <span className="hidden group-open/badge:inline">{t.hideChecks}</span>
        </span>
        <ChevronDown
          aria-hidden
          className="size-5 shrink-0 text-teal-800 transition-transform duration-300 group-open/badge:rotate-180"
        />
      </summary>

      <div className="animate-fade-in border-t border-teal-100 px-4 pb-5 pt-4 sm:px-5">
        <p className="font-bold text-ink">{t.checksTitle}</p>
        <ul className="mt-3 space-y-2.5">
          {verificationChecks.map((check) => (
            <li key={check} className="flex gap-3 text-ink-700">
              <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-teal-600" strokeWidth={2.5} />
              {check}
            </li>
          ))}
        </ul>

        <p className="mt-5 font-bold text-ink">{t.aboutTitle}</p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-cream-100 p-4">
            <dt className="flex items-center gap-2 text-sm font-semibold text-ink-600">
              <BadgeCheck aria-hidden className="size-4 text-teal-700" />
              {t.idTitle}
            </dt>
            <dd className="mt-1 text-ink-800">{t.idBody}</dd>
          </div>
          <div className="rounded-2xl bg-cream-100 p-4">
            <dt className="text-sm font-semibold text-ink-600">{t.recordTitle}</dt>
            <dd className="mt-1 text-ink-800">
              {plural(t.record, creator.postsCount, { date: formatDate(creator.memberSince, locale) })}
            </dd>
          </div>
          {coordinator && tier && (
            <div className="rounded-2xl bg-cream-100 p-4 sm:col-span-2">
              <dt className="text-sm font-semibold text-ink-600">
                {fmt(t.coordinatorTitle, {
                  name: coordinator.displayName,
                  short: tier.short,
                  tier: tier.name,
                })}
              </dt>
              <dd className="mt-1 text-ink-800">
                {plural(t.coordinatorClosed, coordinator.closedCampaigns, { meaning: tier.meaning })}
                {rate && fmt(t.coordinatorOnTime, { rate })}.
                {coordinator.organizationName && fmt(t.coordinatorOrg, { org: coordinator.organizationName })}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </details>
  );
}
