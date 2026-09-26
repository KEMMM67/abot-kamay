// apps/web/components/creator/kyc-status.tsx
//
// What a creator sees while their ID is reviewed, or when their verification was revoked.
import { Clock, ShieldAlert } from 'lucide-react';
import { formatDateTime } from '@/lib/format';
import { getLocale, getMessages } from '@/lib/i18n/server';
import type { Viewer } from '@/lib/types';
import { PendingRefresher } from './pending-refresher';

/** How often the review screen asks the server whether a reviewer has decided. */
const REVIEW_POLL_SECONDS = 30;

export async function KycPending({ viewer }: { viewer: Viewer }) {
  const [messages, locale] = await Promise.all([getMessages(), getLocale()]);
  const t = messages.creator.kycPending;
  const check = viewer.latestVerification;
  return (
    <div className="rounded-3xl border border-gold-200 bg-white p-6 shadow-card sm:p-8">
      <div className="flex items-start gap-4">
        <span className="relative grid size-14 shrink-0 place-items-center rounded-2xl bg-gold-400 text-ink">
          <span aria-hidden className="animate-pulse-ring absolute inset-0 rounded-2xl bg-gold-400" />
          <Clock aria-hidden className="relative size-7" />
        </span>
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold tracking-tight text-ink">{t.title}</h2>
          <p className="mt-2 text-lg leading-relaxed text-ink-700">{t.body}</p>
          {check && (
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-cream-100 p-4">
                <dt className="text-sm font-semibold text-ink-600">{t.submittedId}</dt>
                <dd className="mt-1 font-semibold text-ink">{messages.labels.idTypes[check.idType]}</dd>
              </div>
              <div className="rounded-2xl bg-cream-100 p-4">
                <dt className="text-sm font-semibold text-ink-600">{t.submittedAt}</dt>
                <dd className="mt-1 font-semibold text-ink">{formatDateTime(check.submittedAt, locale)}</dd>
              </div>
            </dl>
          )}
          <PendingRefresher intervalSeconds={REVIEW_POLL_SECONDS} />
        </div>
      </div>
    </div>
  );
}

export async function KycRevoked() {
  const t = (await getMessages()).creator.kycRevoked;
  return (
    <div className="rounded-3xl border border-coral-200 bg-coral-50 p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <ShieldAlert aria-hidden className="mt-1 size-8 shrink-0 text-coral-700" />
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-ink">{t.title}</h2>
          <p className="mt-2 text-lg leading-relaxed text-ink-700">{t.body}</p>
        </div>
      </div>
    </div>
  );
}
