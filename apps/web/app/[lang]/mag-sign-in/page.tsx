// apps/web/app/[lang]/mag-sign-in/page.tsx
//
// Sign-in for the account pages (/ako, a campaign's receipt form). ?next= is only followed to those
// same-site paths (safeNextPath), so a crafted link can't send someone to another site after sign-in.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SignInForm } from '@/components/creator/sign-in-form';
import { PageTransition } from '@/components/page-transition';
import { CreatorMessagesProvider } from '@/lib/i18n/client';
import { creatorMessages } from '@/lib/i18n/client-messages';
import { getMessages } from '@/lib/i18n/server';
import { getViewer, safeNextPath } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages();
  return { title: t.signIn.metaTitle, robots: { index: false } };
}

export default async function SignInPage({ searchParams }: PageProps<'/[lang]/mag-sign-in'>) {
  const { next } = await searchParams;
  const target = safeNextPath(typeof next === 'string' ? next : undefined);
  if (await getViewer()) redirect(target);
  const messages = await getMessages();
  const t = messages.signIn;

  return (
    <PageTransition>
      <div className="container-page pb-20 pt-10 sm:pt-16">
        <div className="mx-auto max-w-lg">
          <h1 className="animate-fade-up text-4xl font-extrabold tracking-tight text-ink">{t.title}</h1>
          <p className="animate-fade-up animation-delay-100 mt-3 text-lg leading-relaxed text-ink-700">
            {t.intro}
          </p>
          <div className="animate-fade-up animation-delay-200 mt-8 rounded-3xl border border-ink-100 bg-white p-6 shadow-card sm:p-8">
            <CreatorMessagesProvider messages={creatorMessages(messages)}>
              <SignInForm next={target} />
            </CreatorMessagesProvider>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
