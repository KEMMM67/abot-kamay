// apps/web/app/[lang]/mag-post/layout.tsx
//
// The "Create post & verify ID" flow. One place, three steps, decided from the signed-in user:
//   1. sign in with a mobile number       (no session)
//   2. verify a government ID             (kyc_status UNVERIFIED, PENDING_ID, REJECTED or EXPIRED)
//   3. create the post                    (kyc_status VERIFIED: the KYC front gate is open)
// The layout draws the steps; the page renders the current one. Reading the session cookie makes this
// route dynamic and per-user, while the public feed and campaign pages stay cached. The forms' words
// travel to the browser only here (CreatorMessagesProvider).
import { LogOut, UserRound } from 'lucide-react';
import type { Metadata } from 'next';
import { FlowSteps } from '@/components/creator/flow-steps';
import { StatusChip } from '@/components/ui/status-chip';
import { signOut } from '@/lib/actions/creator';
import { KYC_STATUS_TONES } from '@/lib/format';
import { CreatorMessagesProvider } from '@/lib/i18n/client';
import { creatorMessages } from '@/lib/i18n/client-messages';
import { rich } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';
import { getViewer } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getMessages()).creator;
  return { title: t.metaTitle, description: t.metaDescription, robots: { index: false } };
}

export default async function CreatePostLayout({ children }: LayoutProps<'/[lang]/mag-post'>) {
  const [viewer, messages] = await Promise.all([getViewer(), getMessages()]);
  const t = messages.creator;
  const step = !viewer ? 1 : viewer.canPost ? 3 : 2;

  return (
    <div className="container-page pb-20 pt-8 sm:pt-12">
      <div className="mx-auto max-w-3xl">
        <header className="animate-fade-up">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-teal-700">{t.eyebrow}</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">{t.title}</h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-700">{t.intro}</p>
        </header>

        <div className="animate-fade-up animation-delay-100 mt-8">
          <FlowSteps current={step} />
        </div>

        {viewer && (
          <div className="animate-fade-in mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream-100 px-4 py-2">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-700">
              <UserRound aria-hidden className="size-5 text-ink-500" />
              <span>
                {rich(t.signedInAs, {
                  name: (
                    <strong className="text-ink">{viewer.displayName ?? viewer.phoneMasked ?? t.you}</strong>
                  ),
                })}
              </span>
              <StatusChip tone={KYC_STATUS_TONES[viewer.kycStatus]}>
                {messages.labels.kycStatus[viewer.kycStatus]}
              </StatusChip>
            </p>
            <form action={signOut}>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 font-semibold text-ink-700 hover:text-teal-800"
              >
                <LogOut aria-hidden className="size-4" />
                {messages.common.signOut}
              </button>
            </form>
          </div>
        )}

        <div className="mt-8">
          <CreatorMessagesProvider messages={creatorMessages(messages)}>{children}</CreatorMessagesProvider>
        </div>
      </div>
    </div>
  );
}
