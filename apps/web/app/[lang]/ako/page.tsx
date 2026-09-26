// apps/web/app/[lang]/ako/page.tsx
//
// "Ako": the signed-in creator's own page. Where they stand on the KYC front gate, their posts
// (including ones still in review, with the reviewer's note when one was not approved), and the
// shortcut to post receipts: creator-led transparency starts here.
import { ArrowUpRight, LogOut, Plus, ReceiptText, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageTransition } from '@/components/page-transition';
import { ButtonLink } from '@/components/ui/button';
import { StatusChip } from '@/components/ui/status-chip';
import { signOut } from '@/lib/actions/creator';
import { getMyCampaigns } from '@/lib/data/account';
import { CAMPAIGN_STATUS_TONES, formatDate, KYC_STATUS_TONES } from '@/lib/format';
import { fmt, plural, rich } from '@/lib/i18n/format';
import { getLocale, getMessages } from '@/lib/i18n/server';
import { formatPeso } from '@/lib/money';
import { getViewer } from '@/lib/session';
import type { Viewer } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages();
  return { title: t.account.metaTitle, robots: { index: false } };
}

export default async function AccountPage() {
  const viewer = await getViewer();
  if (!viewer) redirect('/mag-sign-in?next=/ako');
  const [campaigns, messages, locale] = await Promise.all([getMyCampaigns(), getMessages(), getLocale()]);
  const t = messages.account;

  function kycSummary(person: Viewer): string {
    if (person.kycStatus === 'VERIFIED' && person.kycVerifiedAt) {
      const date = formatDate(person.kycVerifiedAt, locale);
      return person.kycExpiresAt
        ? fmt(t.kycVerifiedUntil, { date, until: formatDate(person.kycExpiresAt, locale) })
        : fmt(t.kycVerified, { date });
    }
    if (person.kycStatus === 'PENDING_ID') return t.kycPending;
    if (person.kycStatus === 'REVOKED') return t.kycRevoked;
    return t.kycNone;
  }

  return (
    <PageTransition>
      <div className="container-page pb-20 pt-8 sm:pt-12">
        <div className="mx-auto max-w-3xl space-y-8">
          <header className="animate-fade-up flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-teal-700">{t.eyebrow}</p>
              <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-ink">
                {viewer.displayName ?? t.hello}
              </h1>
              <p className="mt-1 text-ink-600">{viewer.phoneMasked}</p>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="inline-flex min-h-12 items-center gap-2 rounded-xl px-2 font-semibold text-ink-700 hover:text-teal-800"
              >
                <LogOut aria-hidden className="size-5" />
                {messages.common.signOut}
              </button>
            </form>
          </header>

          <section
            aria-labelledby="kyc-heading"
            className="animate-fade-up animation-delay-100 rounded-3xl border border-ink-100 bg-white p-6 shadow-card"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="kyc-heading" className="flex items-center gap-2 text-xl font-bold text-ink">
                <ShieldCheck aria-hidden className="size-6 text-teal-700" />
                {t.kycHeading}
              </h2>
              <StatusChip tone={KYC_STATUS_TONES[viewer.kycStatus]}>
                {messages.labels.kycStatus[viewer.kycStatus]}
              </StatusChip>
            </div>
            <p className="mt-3 leading-relaxed text-ink-700">{kycSummary(viewer)}</p>
            {!viewer.canPost && viewer.kycStatus !== 'PENDING_ID' && viewer.kycStatus !== 'REVOKED' && (
              <ButtonLink href="/mag-post" className="mt-5">
                {t.verifyNow}
              </ButtonLink>
            )}
          </section>

          <section aria-labelledby="posts-heading" className="animate-fade-up animation-delay-200">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="posts-heading" className="text-2xl font-extrabold tracking-tight text-ink">
                {t.postsHeading}
              </h2>
              {viewer.canPost && (
                <ButtonLink href="/mag-post">
                  <Plus aria-hidden />
                  {t.newPost}
                </ButtonLink>
              )}
            </div>

            {campaigns.length === 0 ? (
              <p className="mt-4 rounded-3xl border-2 border-dashed border-ink-200 bg-white p-6 text-ink-700">
                {t.noPosts}
              </p>
            ) : (
              <ul className="mt-4 space-y-4">
                {campaigns.map((campaign) => (
                  <li
                    key={campaign.id}
                    className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-6"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip tone={CAMPAIGN_STATUS_TONES[campaign.status]}>
                        {messages.labels.campaignStatus[campaign.status]}
                      </StatusChip>
                      <StatusChip tone="neutral">
                        {messages.labels.funding[campaign.fundingType].short}
                      </StatusChip>
                    </div>
                    <h3 className="mt-3 text-lg font-bold leading-snug text-ink">{campaign.title}</h3>
                    <p className="mt-1 text-ink-600">
                      {fmt(t.postedOn, { date: formatDate(campaign.createdAt, locale) })}
                      {campaign.publishedAt &&
                        fmt(t.liveSince, { date: formatDate(campaign.publishedAt, locale) })}
                    </p>
                    <p className="mt-2 text-ink-800">
                      {rich(t.raised, { amount: <strong>{formatPeso(campaign.raisedMinor)}</strong> })}
                      {campaign.goalMinor && fmt(t.raisedOfGoal, { goal: formatPeso(campaign.goalMinor) })}
                      {plural(t.receipts, campaign.receiptCount)}
                    </p>
                    {campaign.reviewNote && campaign.status === 'CANCELLED' && (
                      <p className="mt-3 rounded-2xl bg-coral-50 px-4 py-3 text-coral-800">
                        <strong>{t.reviewerNote}</strong> {campaign.reviewNote}
                      </p>
                    )}
                    {campaign.status === 'PENDING_REVIEW' && (
                      <p className="mt-3 text-ink-700">{t.inReview}</p>
                    )}
                    {campaign.isPublic && (
                      <div className="mt-4 flex flex-wrap gap-3">
                        <ButtonLink href={`/campaigns/${campaign.slug}/mag-ulat`}>
                          <ReceiptText aria-hidden />
                          {t.report}
                        </ButtonLink>
                        <Link
                          href={`/campaigns/${campaign.slug}`}
                          className="inline-flex min-h-12 items-center gap-1.5 rounded-xl px-2 font-semibold text-teal-700 underline-offset-4 hover:underline"
                        >
                          {t.viewCampaign}
                          <ArrowUpRight aria-hidden className="size-4" />
                        </Link>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </PageTransition>
  );
}
