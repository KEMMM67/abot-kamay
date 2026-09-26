// apps/web/app/[lang]/layout.tsx
//
// Root layout, once per language: Filipino (/fil) and English (/en) inside the server. proxy.ts maps
// every public URL onto one of them from the visitor's choice, so each page is prerendered and cached
// per language and no page reads a cookie to pick its words. <html lang> follows the language, so
// screen readers switch pronunciation too.
import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { notFound } from 'next/navigation';
import { lang } from 'next/root-params';
import type { ReactNode } from 'react';
import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { MotionProvider } from '@/components/motion-provider';
import { SITE_URL } from '@/lib/config';
import { LanguageProvider } from '@/lib/i18n/client';
import { siteMessages } from '@/lib/i18n/client-messages';
import { HTML_LANG, isLocale, LOCALES, OG_LOCALE } from '@/lib/i18n/config';
import { getLocale, getMessages } from '@/lib/i18n/server';
import '../globals.css';

// Brand typeface (brand/BRAND.md). next/font self-hosts it at build time: no request to Google from
// the donor's browser, no layout shift, and ñ is included.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jakarta',
});

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ lang: locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t.meta.defaultTitle, template: '%s · AbotKamay' },
    description: t.meta.description,
    applicationName: 'AbotKamay',
    openGraph: {
      type: 'website',
      siteName: 'AbotKamay',
      locale: OG_LOCALE[locale],
      title: t.meta.defaultTitle,
      description: t.meta.description,
    },
    twitter: { card: 'summary_large_image' },
    // Stops iOS from turning numbers into call links (the checker shows phone numbers).
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: '#FFF8EC',
  colorScheme: 'light',
  // Pinch-zoom stays enabled: many donors are older adults (WCAG 1.4.4).
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // proxy.ts always rewrites to a real language; anything else (e.g. /wp-login.php, which skips the
  // proxy because of the dot) must not render the home page with a 200.
  if (!isLocale(await lang())) notFound();
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);

  return (
    <html lang={HTML_LANG[locale]} data-scroll-behavior="smooth" className={jakarta.variable}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main-content"
          className="sr-only z-[60] rounded-xl bg-ink px-5 py-3 font-semibold text-cream focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-3"
        >
          {t.meta.skipToContent}
        </a>
        <LanguageProvider locale={locale} messages={siteMessages(t)}>
          <MotionProvider>
            <Navbar />
            <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
              {children}
            </main>
            <Footer />
          </MotionProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
