// apps/web/components/campaigns/share-link.tsx
'use client';

import { Check, Copy, Share2 } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { buttonClasses } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { officialShortLink } from '@/lib/config';
import { useMessages } from '@/lib/i18n/client';

const noopSubscribe = () => () => {};

/**
 * The official short link (anti-impostor: creators pin it, QR codes print it). Uses the phone's share
 * sheet when there is one, and copies the link everywhere. The link carries no language: whoever opens
 * it sees the site in the language they chose.
 */
export function ShareLink({ slug, title, className }: { slug: string; title: string; className?: string }) {
  const messages = useMessages();
  const t = messages.donate.share;
  const { url, display } = officialShortLink(slug);
  const canShare = useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator.share === 'function',
    () => false,
  );
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus('copied');
    } catch {
      // The clipboard API needs a secure context (not plain http on a LAN address).
      setStatus('failed');
    }
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setStatus('idle'), 3000);
  }

  async function share() {
    try {
      await navigator.share({ title, url });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      await copy();
    }
  }

  return (
    <div className={cn('rounded-2xl bg-cream-100 p-4', className)}>
      <p className="text-sm font-semibold text-ink-600">{t.title}</p>
      <p className="mt-0.5 break-all font-semibold text-ink">{display}</p>
      <p className="mt-1 text-sm text-ink-600">{t.hint}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {canShare && (
          <button
            type="button"
            onClick={share}
            className={buttonClasses({ variant: 'secondary', className: 'flex-1 px-3' })}
          >
            <Share2 aria-hidden />
            {t.share}
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          className={buttonClasses({ variant: 'secondary', className: 'flex-1 px-3' })}
        >
          {status === 'copied' ? <Check aria-hidden className="text-teal-600" /> : <Copy aria-hidden />}
          {status === 'copied' ? messages.common.copied : t.copy}
        </button>
      </div>
      <p aria-live="polite" className={cn('text-sm', status === 'failed' ? 'mt-2 text-ink-700' : 'sr-only')}>
        {status === 'copied' && t.copiedAnnouncement}
        {status === 'failed' && t.copyFailed}
      </p>
    </div>
  );
}
