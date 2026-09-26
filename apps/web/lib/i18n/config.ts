// apps/web/lib/i18n/config.ts
//
// The two languages of AbotKamay and how a visitor's choice travels. Imported by proxy.ts, Server
// Components and Client Components, so it holds constants and pure functions only.
//
// - Filipino (conversational Taglish) is the default for everyone: most donors and creators read it
//   first, and most Philippine phones report English in Accept-Language, so that header is ignored.
// - English is for formal and corporate donors. Choosing it sets the ak_lang cookie; proxy.ts reads the
//   cookie and rewrites /campaigns to /en/campaigns inside the server. Public URLs never carry the
//   language, so share links and the /c/{slug} short links printed on QR codes work for everyone.

export const LOCALES = ['fil', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'fil';

/** Remembers the visitor's choice for a year. Only the server reads it (proxy.ts, Server Actions). */
export const LOCALE_COOKIE = 'ak_lang';
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** `?lang=en` on any page switches the language (the navbar toggle and shareable English links). */
export const LOCALE_QUERY_PARAM = 'lang';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** The cookie value if it names a supported language, otherwise Filipino. */
export function localeFrom(value: string | null | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * The public path of a page: "/fil/campaigns" -> "/campaigns". While a page is prerendered the router
 * reports the internal path; in the browser it reports the public one. Comparing through this keeps
 * both renders identical (no hydration mismatch in active links).
 */
export function publicPathname(pathname: string): string {
  const prefix = LOCALES.find((locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`));
  return prefix ? pathname.slice(prefix.length + 1) || '/' : pathname;
}

/** <html lang>: screen readers pick Filipino or English pronunciation from it. */
export const HTML_LANG: Record<Locale, string> = { fil: 'fil-PH', en: 'en-PH' };

/** Open Graph locale for link previews on Facebook and Messenger. */
export const OG_LOCALE: Record<Locale, string> = { fil: 'tl_PH', en: 'en_PH' };

/** Each language names itself, so the toggle is readable whichever language is showing. */
export const LOCALE_NAMES: Record<Locale, { native: string; short: string }> = {
  fil: { native: 'Filipino', short: 'FIL' },
  en: { native: 'English', short: 'EN' },
};
