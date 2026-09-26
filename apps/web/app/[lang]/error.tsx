// apps/web/app/[lang]/error.tsx
'use client'; // Error boundaries must be Client Components

import { RotateCcw, TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { useMessages } from '@/lib/i18n/client';
import { fmt } from '@/lib/i18n/format';

/**
 * Shown when a page fails to render. Next.js 16.3: `retry` re-fetches and re-renders the segment.
 * Server errors arrive with a generic message and a digest that matches the server logs. It renders
 * inside the root layout, so the visitor's language is still available.
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const { errors, common } = useMessages();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container-page flex flex-col items-center py-20 text-center sm:py-28">
      <span className="grid size-16 place-items-center rounded-3xl bg-gold-100 text-gold-800">
        <TriangleAlert aria-hidden className="size-8" />
      </span>
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{errors.pageTitle}</h1>
      <p className="mt-4 max-w-md text-lg leading-relaxed text-ink-700">{errors.pageBody}</p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Button size="lg" onClick={() => retry()}>
          <RotateCcw aria-hidden />
          {common.tryAgain}
        </Button>
        <ButtonLink href="/" size="lg" variant="secondary">
          {common.backHome}
        </ButtonLink>
      </div>
      {error.digest && (
        <p className="mt-6 text-sm text-ink-600">{fmt(common.reference, { digest: error.digest })}</p>
      )}
    </div>
  );
}
