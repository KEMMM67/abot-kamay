// apps/web/components/layout/navbar.tsx
'use client';

import { Camera, ChevronRight, UserRound } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { Logo } from '@/components/brand/logo';
import { ButtonLink } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useMessages } from '@/lib/i18n/client';
import { publicPathname } from '@/lib/i18n/config';
import { LanguageToggle } from './language-toggle';

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

function isActive(pathname: string, href: string): boolean {
  if (href.includes('#')) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Sticky top navigation. Transparent over the page until you scroll, then a frosted bar. On phones
 * the links move into a disclosure menu that slides down under the bar: Escape, a tap outside, or
 * a navigation closes it, and focus returns to the menu button. The language toggle stays in the bar
 * on every screen size.
 */
export function Navbar() {
  const t = useMessages().nav;
  const pathname = publicPathname(usePathname());
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  const links: ReadonlyArray<{ href: Route; label: string }> = [
    { href: '/campaigns', label: t.feed },
    { href: '/verify', label: t.verify },
    { href: '/#how-it-works', label: t.howItWorks },
  ];

  // Close the menu after navigation (React's "adjust state when a value changes" pattern).
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    const desktop = window.matchMedia('(min-width: 48rem)');
    const onBreakpoint = () => {
      if (desktop.matches) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    desktop.addEventListener('change', onBreakpoint);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      desktop.removeEventListener('change', onBreakpoint);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <header
        style={{ viewTransitionName: 'site-header' }}
        className={cn(
          'sticky top-0 z-50 border-b transition-[background-color,border-color,box-shadow] duration-300',
          scrolled || open
            ? 'border-ink-100 bg-cream/90 shadow-[0_10px_30px_-24px_rgb(11_43_38/0.5)] backdrop-blur-lg'
            : 'border-transparent bg-cream/0',
        )}
      >
        <div className="container-page flex h-18 items-center justify-between gap-3">
          <Link href="/" aria-label={t.home} className="-m-1 shrink-0 rounded-xl p-1">
            <Logo compact />
          </Link>

          <nav aria-label={t.label} className="hidden md:block">
            <ul className="flex items-center gap-1">
              {links.map((link) => {
                const active = isActive(pathname, link.href);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group relative inline-flex h-12 items-center rounded-xl px-4 font-semibold transition-colors duration-200',
                        active ? 'text-teal-700' : 'text-ink-700 hover:text-ink',
                      )}
                    >
                      {link.label}
                      <span
                        aria-hidden
                        className={cn(
                          'absolute inset-x-4 bottom-2 h-0.5 origin-left rounded-full bg-teal-600 transition-transform duration-300 ease-out-expo',
                          active ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100',
                        )}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            <LanguageToggle />
            <Link
              href="/ako"
              aria-current={isActive(pathname, '/ako') ? 'page' : undefined}
              className="hidden size-12 place-items-center rounded-xl text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink aria-[current=page]:text-teal-700 md:grid"
            >
              <UserRound aria-hidden className="size-6" />
              <span className="sr-only">{t.account}</span>
            </Link>
            <ButtonLink href="/mag-post" className="hidden md:inline-flex">
              <Camera aria-hidden />
              {t.post}
            </ButtonLink>
            <button
              ref={toggleRef}
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-controls={open ? menuId : undefined}
              className="grid size-12 place-items-center rounded-xl text-ink transition-colors hover:bg-ink-50 md:hidden"
            >
              <span className="sr-only">{open ? t.closeMenu : t.menu}</span>
              <span aria-hidden className="relative block h-4 w-6">
                <span
                  className={cn(
                    'absolute left-0 top-0 h-0.5 w-6 rounded-full bg-current transition-transform duration-300 ease-out-expo',
                    open && 'translate-y-[7px] rotate-45',
                  )}
                />
                <span
                  className={cn(
                    'absolute left-0 top-[7px] h-0.5 w-6 rounded-full bg-current transition-opacity duration-200',
                    open && 'opacity-0',
                  )}
                />
                <span
                  className={cn(
                    'absolute bottom-0 left-0 h-0.5 w-6 rounded-full bg-current transition-transform duration-300 ease-out-expo',
                    open && '-translate-y-[7px] -rotate-45',
                  )}
                />
              </span>
            </button>
          </div>
        </div>

        <AnimatePresence>
          {open && (
            <m.nav
              key="mobile-menu"
              id={menuId}
              aria-label={t.label}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
              className="absolute inset-x-0 top-full border-b border-ink-100 bg-cream shadow-lift md:hidden"
            >
              <m.ul
                initial="hidden"
                animate="visible"
                variants={{ visible: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } } }}
                className="container-page flex flex-col gap-1 pt-3"
              >
                {links.map((link) => (
                  <m.li
                    key={link.href}
                    variants={{
                      hidden: { opacity: 0, x: -12 },
                      visible: { opacity: 1, x: 0, transition: { duration: 0.3, ease: EASE_OUT_EXPO } },
                    }}
                  >
                    <Link
                      href={link.href}
                      onClick={close}
                      aria-current={isActive(pathname, link.href) ? 'page' : undefined}
                      className="flex min-h-14 items-center justify-between rounded-2xl px-4 text-xl font-semibold text-ink transition-colors hover:bg-white aria-[current=page]:bg-white aria-[current=page]:text-teal-700"
                    >
                      {link.label}
                      <ChevronRight aria-hidden className="size-5 text-ink-400" />
                    </Link>
                  </m.li>
                ))}
              </m.ul>
              <div className="container-page flex flex-col gap-2 pb-6 pt-4">
                <ButtonLink href="/mag-post" size="lg" className="w-full" onClick={close}>
                  <Camera aria-hidden />
                  {t.postCampaign}
                </ButtonLink>
                <ButtonLink href="/ako" size="lg" variant="secondary" className="w-full" onClick={close}>
                  <UserRound aria-hidden />
                  {t.account}
                </ButtonLink>
              </div>
            </m.nav>
          )}
        </AnimatePresence>
      </header>

      <AnimatePresence>
        {open && (
          <m.div
            key="menu-backdrop"
            data-scroll-lock=""
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={close}
            className="fixed inset-0 z-40 bg-ink/40 md:hidden"
          />
        )}
      </AnimatePresence>
    </>
  );
}
