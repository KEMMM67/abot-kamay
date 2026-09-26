// apps/web/app/[lang]/mag-post/page.tsx
//
// Renders the current step of the flow (see layout.tsx). The KYC front gate is decided by the API and
// enforced again by the database; this page only shows the right form. Unverified users can still
// browse and donate everywhere else.
import { BadgeCheck, EyeOff, ReceiptText } from 'lucide-react';
import { CreatePostForm } from '@/components/creator/create-post-form';
import { KycPending, KycRevoked } from '@/components/creator/kyc-status';
import { SignInForm } from '@/components/creator/sign-in-form';
import { VerifyIdForm } from '@/components/creator/verify-id-form';
import { PageTransition } from '@/components/page-transition';
import { getMessages } from '@/lib/i18n/server';
import { getViewer } from '@/lib/session';

const WHY_ICONS = [BadgeCheck, EyeOff, ReceiptText] as const;

export default async function CreatePostPage() {
  const [viewer, messages] = await Promise.all([getViewer(), getMessages()]);
  const t = messages.creator;

  if (!viewer) {
    return (
      <PageTransition>
        <section
          aria-labelledby="sign-in-heading"
          className="rounded-3xl border border-ink-100 bg-white p-6 shadow-card sm:p-8"
        >
          <h2 id="sign-in-heading" className="text-2xl font-extrabold tracking-tight text-ink">
            {t.signInHeading}
          </h2>
          <p className="mt-2 text-lg leading-relaxed text-ink-700">{t.signInIntro}</p>
          <div className="mt-6">
            <SignInForm />
          </div>
        </section>
      </PageTransition>
    );
  }

  if (viewer.canPost) {
    return (
      <PageTransition>
        <CreatePostForm creatorName={viewer.displayName ?? t.someVerifiedCreator} />
      </PageTransition>
    );
  }

  if (viewer.kycStatus === 'PENDING_ID') {
    return (
      <PageTransition>
        <KycPending viewer={viewer} />
      </PageTransition>
    );
  }

  if (viewer.kycStatus === 'REVOKED') {
    return (
      <PageTransition>
        <KycRevoked />
      </PageTransition>
    );
  }

  // UNVERIFIED, REJECTED or EXPIRED: verify (again) before posting.
  return (
    <PageTransition>
      <section aria-labelledby="why-heading" className="mb-6 rounded-3xl bg-ink p-6 text-cream sm:p-8">
        <h2 id="why-heading" className="text-2xl font-extrabold tracking-tight">
          {viewer.kycStatus === 'EXPIRED' ? t.renewHeading : t.whyHeading}
        </h2>
        <ul className="mt-5 grid gap-4 sm:grid-cols-3">
          {t.why.map(({ title, body }, index) => {
            const Icon = WHY_ICONS[index] ?? BadgeCheck;
            return (
              <li key={title}>
                <Icon aria-hidden className="size-6 text-teal-300" />
                <p className="mt-2 font-bold">{title}</p>
                <p className="mt-1 text-ink-200">{body}</p>
              </li>
            );
          })}
        </ul>
      </section>
      <VerifyIdForm viewer={viewer} />
    </PageTransition>
  );
}
