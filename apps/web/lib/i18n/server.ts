// apps/web/lib/i18n/server.ts
//
// The visitor's language in Server Components and server-side data functions. It comes from the
// [lang] root segment (next/root-params) that proxy.ts rewrites every request into, never from a
// cookie read here: /fil/campaigns and /en/campaigns are two static, cached pages.
// Server Actions can't read root params; they use lib/i18n/action.ts.
import { lang } from 'next/root-params';
import { cache } from 'react';
import { localeFrom, type Locale } from './config';
import { en } from './messages/en';
import { fil, type Messages } from './messages/fil';

const MESSAGES: Record<Locale, Messages> = { fil, en };

/** The language of the page being rendered. */
export const getLocale = cache(async (): Promise<Locale> => localeFrom(await lang()));

/** Every message, in the language of the page being rendered. */
export async function getMessages(): Promise<Messages> {
  return MESSAGES[await getLocale()];
}

export function messagesFor(locale: Locale): Messages {
  return MESSAGES[locale];
}
