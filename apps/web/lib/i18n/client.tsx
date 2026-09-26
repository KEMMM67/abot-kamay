// apps/web/lib/i18n/client.tsx
'use client';

//
// Messages for Client Components. The root layout wraps every page in <LanguageProvider>; the creator
// routes add <CreatorMessagesProvider> for the forms (see client-messages.ts for what each carries).
// Switching languages is a full page load (?lang= through proxy.ts), so these values never change
// while a page is open.
import { createContext, use, type ReactNode } from 'react';
import type { Locale } from './config';
import type { CreatorMessages, SiteMessages } from './client-messages';

const SiteContext = createContext<{ locale: Locale; messages: SiteMessages } | null>(null);
const CreatorContext = createContext<CreatorMessages | null>(null);

export function LanguageProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: SiteMessages;
  children: ReactNode;
}) {
  return <SiteContext value={{ locale, messages }}>{children}</SiteContext>;
}

export function CreatorMessagesProvider({
  messages,
  children,
}: {
  messages: CreatorMessages;
  children: ReactNode;
}) {
  return <CreatorContext value={messages}>{children}</CreatorContext>;
}

function useSite() {
  const site = use(SiteContext);
  if (!site) throw new Error('useLocale/useMessages must be used inside <LanguageProvider>');
  return site;
}

export function useLocale(): Locale {
  return useSite().locale;
}

export function useMessages(): SiteMessages {
  return useSite().messages;
}

export function useCreatorMessages(): CreatorMessages {
  const messages = use(CreatorContext);
  if (!messages) throw new Error('useCreatorMessages must be used inside <CreatorMessagesProvider>');
  return messages;
}
