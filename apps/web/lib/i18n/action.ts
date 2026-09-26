// apps/web/lib/i18n/action.ts
//
// The visitor's language inside Server Actions, which can't read root params: the ak_lang cookie that
// proxy.ts set when they picked a language (Filipino when there is none). The page that called the
// action was rendered from the same cookie, so its messages match.
import 'server-only';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE, localeFrom, type Locale } from './config';
import { en } from './messages/en';
import { fil, type Messages } from './messages/fil';

export async function getActionLocale(): Promise<Locale> {
  return localeFrom((await cookies()).get(LOCALE_COOKIE)?.value);
}

export async function getActionMessages(): Promise<Messages> {
  return (await getActionLocale()) === 'en' ? en : fil;
}
