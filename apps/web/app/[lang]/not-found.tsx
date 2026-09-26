// apps/web/app/[lang]/not-found.tsx
//
// Every "not found" in the app lands here: unknown paths (through [...missing]), campaigns that don't
// exist or aren't public, and anything else notFound() is called for. Rendered in the visitor's language.
import { LogoMark } from '@/components/brand/logo';
import { ButtonLink } from '@/components/ui/button';
import { getMessages } from '@/lib/i18n/server';

export default async function NotFound() {
  const { errors, common } = await getMessages();
  return (
    <div className="container-page flex flex-col items-center py-20 text-center sm:py-28">
      <LogoMark className="size-20" />
      <p className="mt-6 text-sm font-bold uppercase tracking-[0.14em] text-teal-700">
        {errors.notFoundEyebrow}
      </p>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
        {errors.notFoundTitle}
      </h1>
      <p className="mt-4 max-w-md text-lg leading-relaxed text-ink-700">{errors.notFoundBody}</p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <ButtonLink href="/" size="lg">
          {common.backHome}
        </ButtonLink>
        <ButtonLink href="/campaigns" size="lg" variant="secondary">
          {common.viewFeed}
        </ButtonLink>
      </div>
    </div>
  );
}
