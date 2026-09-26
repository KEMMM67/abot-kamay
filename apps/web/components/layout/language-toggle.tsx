// apps/web/components/layout/language-toggle.tsx
'use client';

//
// FIL | EN, in the navbar on every screen size. Each option is a plain link to the same page with
// ?lang=: proxy.ts remembers the choice (ak_lang cookie) and redirects back to the clean URL, which
// then renders in the new language. It works without JavaScript; with it, the current query string and
// #section are kept. Each language is written in itself, so it is readable whichever one is showing.
import { usePathname } from 'next/navigation';
import type { MouseEvent } from 'react';
import { cn } from '@/lib/cn';
import { useLocale, useMessages } from '@/lib/i18n/client';
import {
  HTML_LANG,
  LOCALE_NAMES,
  LOCALE_QUERY_PARAM,
  LOCALES,
  publicPathname,
  type Locale,
} from '@/lib/i18n/config';

export function LanguageToggle({ className }: { className?: string }) {
  const current = useLocale();
  const pathname = publicPathname(usePathname());
  const t = useMessages().nav;

  function switchTo(event: MouseEvent<HTMLAnchorElement>, locale: Locale) {
    event.preventDefault();
    if (locale === current) return;
    const url = new URL(window.location.href);
    url.searchParams.set(LOCALE_QUERY_PARAM, locale);
    window.location.assign(url.toString());
  }

  return (
    <nav
      aria-label={`${t.language} (${t.languageSwitch})`}
      className={cn('flex items-center rounded-xl bg-ink-50 p-1 ring-1 ring-inset ring-ink-100', className)}
    >
      {LOCALES.map((locale) => {
        const active = locale === current;
        return (
          <a
            key={locale}
            href={`${pathname}?${LOCALE_QUERY_PARAM}=${locale}`}
            hrefLang={HTML_LANG[locale]}
            lang={HTML_LANG[locale]}
            aria-current={active ? 'true' : undefined}
            onClick={(event) => switchTo(event, locale)}
            className={cn(
              'grid h-10 min-w-11 place-items-center rounded-lg px-2.5 text-sm font-bold tracking-wide transition-colors duration-200',
              active ? 'bg-white text-teal-800 shadow-card' : 'text-ink-600 hover:text-ink',
            )}
          >
            <span aria-hidden>{LOCALE_NAMES[locale].short}</span>
            <span className="sr-only">{LOCALE_NAMES[locale].native}</span>
          </a>
        );
      })}
    </nav>
  );
}
