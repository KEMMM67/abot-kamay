// apps/web/app/[lang]/campaigns/[slug]/mag-ulat/page.tsx
//
// The creator's receipt form for one campaign. Signed in, and the campaign must be the viewer's own
// and public; the API checks the same things (and the database refuses reports by anyone else).
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { SpendingReportForm } from '@/components/creator/spending-report-form';
import { PageTransition } from '@/components/page-transition';
import { Notice } from '@/components/ui/notice';
import { getOwnCampaign } from '@/lib/data/account';
import { getCampaign, isValidSlug } from '@/lib/data/campaigns';
import { manilaToday } from '@/lib/format';
import { CreatorMessagesProvider } from '@/lib/i18n/client';
import { creatorMessages } from '@/lib/i18n/client-messages';
import { getMessages } from '@/lib/i18n/server';
import { getViewer } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages();
  return { title: t.report.metaTitle, robots: { index: false } };
}

const DAY_MS = 86_400_000;

export default async function SpendingReportPage({ params }: PageProps<'/[lang]/campaigns/[slug]/mag-ulat'>) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();
  const viewer = await getViewer();
  if (!viewer) redirect(`/mag-sign-in?next=/campaigns/${slug}/mag-ulat`);

  const [own, messages] = await Promise.all([getOwnCampaign(slug), getMessages()]);
  const campaign = own?.isPublic ? await getCampaign(slug) : null;
  const t = messages.report;

  return (
    <PageTransition>
      <div className="container-page pb-20 pt-4 sm:pt-6">
        <div className="mx-auto max-w-3xl">
          <Link
            href={own ? `/campaigns/${slug}` : '/ako'}
            className="group -ml-1 inline-flex min-h-12 items-center gap-2 rounded-xl px-1 font-semibold text-ink-700 transition-colors hover:text-teal-700"
          >
            <ArrowLeft
              aria-hidden
              className="size-5 transition-transform duration-300 group-hover:-translate-x-1"
            />
            {own ? t.backToCampaign : t.backToMyPosts}
          </Link>

          <header className="animate-fade-up mt-4">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-teal-700">{t.eyebrow}</p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              {own?.title ?? t.fallbackTitle}
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-ink-700">{t.intro}</p>
          </header>

          <div className="animate-fade-up animation-delay-100 mt-8">
            {!own ? (
              <Notice title={t.notYoursTitle}>{t.notYoursBody}</Notice>
            ) : !campaign ? (
              <Notice title={t.notLiveTitle}>{t.notLiveBody}</Notice>
            ) : (
              <CreatorMessagesProvider messages={creatorMessages(messages)}>
                <SpendingReportForm
                  slug={slug}
                  milestones={campaign.milestones.map((milestone) => ({
                    id: milestone.id,
                    title: milestone.title,
                  }))}
                  today={manilaToday()}
                  earliest={manilaToday(Date.parse(own.createdAt) - 30 * DAY_MS)}
                />
              </CreatorMessagesProvider>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
