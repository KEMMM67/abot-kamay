// apps/web/components/layout/footer.tsx
import type { Route } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { fmt } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';

export async function Footer() {
  const t = (await getMessages()).footer;
  const columns: ReadonlyArray<{
    id: string;
    title: string;
    links: ReadonlyArray<{ href: Route; label: string }>;
  }> = [
    {
      id: 'footer-give',
      title: t.give,
      links: [
        { href: '/campaigns', label: t.giveFeed },
        { href: '/#how-it-works', label: t.giveHow },
      ],
    },
    {
      id: 'footer-create',
      title: t.create,
      links: [
        { href: '/mag-post', label: t.createPost },
        { href: '/ako', label: t.createMine },
      ],
    },
    {
      id: 'footer-safety',
      title: t.safety,
      links: [
        { href: '/verify', label: t.safetyCheck },
        { href: '/campaigns', label: t.safetyOfficial },
      ],
    },
  ];

  return (
    <footer className="border-t border-ink-100 bg-white">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-sm leading-relaxed text-ink-600">
            <span className="font-semibold text-ink">{t.taglineStrong}</span> {t.tagline}
          </p>
        </div>
        {columns.map((column) => (
          <nav key={column.id} aria-labelledby={column.id}>
            <h2 id={column.id} className="font-bold text-ink">
              {column.title}
            </h2>
            <ul className="mt-3 space-y-1">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="inline-flex min-h-11 items-center text-ink-600 underline-offset-4 transition-colors hover:text-teal-700 hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-ink-100">
        <div className="container-page flex flex-col gap-2 py-6 text-sm text-ink-600 sm:flex-row sm:items-center sm:justify-between">
          <p>{fmt(t.copyright, { year: new Date().getFullYear() })}</p>
          <p>{t.noPersonalNumbers}</p>
        </div>
      </div>
    </footer>
  );
}
