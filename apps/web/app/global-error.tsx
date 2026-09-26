// apps/web/app/global-error.tsx
'use client'; // Error boundaries must be Client Components

// Last-resort error page: it replaces the root layout (app/[lang]/layout.tsx) when that fails. Errors
// inside a page are handled by app/[lang]/error.tsx instead. (Next.js 16.3 builds its static 500 page
// from its own built-in error page, not from this file.) It renders its own document, outside the
// language provider, and the language cookie is HttpOnly, so it speaks both languages: Filipino first,
// English underneath. It loads the global styles and brand font itself.
import { Plus_Jakarta_Sans } from 'next/font/google';
import { useEffect } from 'react';
import { LogoMark } from '@/components/brand/logo';
import { buttonClasses } from '@/components/ui/button';
import { fmt } from '@/lib/i18n/format';
import { en } from '@/lib/i18n/messages/en';
import { fil } from '@/lib/i18n/messages/fil';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-jakarta' });

export default function GlobalError({ error }: { error?: Error & { digest?: string } }) {
  useEffect(() => {
    if (error) console.error(error);
  }, [error]);

  return (
    <html lang="fil-PH" className={jakarta.variable}>
      <body className="flex min-h-dvh flex-col items-center justify-center px-4 py-16 text-center">
        <title>{`${fil.errors.pageTitle} · AbotKamay`}</title>
        <LogoMark className="size-16" />
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          {fil.errors.pageTitle}
        </h1>
        <p className="mt-4 max-w-md text-lg leading-relaxed text-ink-700">{fil.errors.pageBody}</p>
        <p lang="en-PH" className="mt-3 max-w-md leading-relaxed text-ink-600">
          <strong className="text-ink-800">{en.errors.pageTitle}.</strong> {en.errors.pageBody}
        </p>
        <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          {/* A full reload works even when the app's JavaScript state is gone. */}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={buttonClasses({ size: 'lg' })}
          >
            {fil.common.tryAgain}
            <span lang="en-PH" className="font-medium opacity-80">
              · {en.common.tryAgain}
            </span>
          </button>
          {/* A plain link on purpose: this page renders outside the app's router. */}
          {/* oxlint-disable-next-line nextjs/no-html-link-for-pages */}
          <a href="/" className={buttonClasses({ size: 'lg', variant: 'secondary' })}>
            {fil.common.backHome}
          </a>
        </div>
        {error?.digest && (
          <p className="mt-6 text-sm text-ink-600">{fmt(fil.common.reference, { digest: error.digest })}</p>
        )}
      </body>
    </html>
  );
}
