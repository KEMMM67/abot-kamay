// apps/web/app/[lang]/campaigns/[slug]/not-found.tsx
import { SearchX } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { getMessages } from '@/lib/i18n/server';

export default async function CampaignNotFound() {
  const messages = await getMessages();
  const t = messages.campaign.notFound;
  return (
    <div className="container-page flex flex-col items-center py-20 text-center sm:py-28">
      <span className="grid size-16 place-items-center rounded-3xl bg-gold-100 text-gold-800">
        <SearchX aria-hidden className="size-8" />
      </span>
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{t.title}</h1>
      <p className="mt-4 max-w-lg text-lg leading-relaxed text-ink-700">{t.body}</p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <ButtonLink href="/campaigns" size="lg">
          {messages.common.viewFeed}
        </ButtonLink>
        <ButtonLink href="/verify" size="lg" variant="secondary">
          {messages.common.checkNumber}
        </ButtonLink>
      </div>
    </div>
  );
}
