// apps/web/components/creator/pending-refresher.tsx
'use client';

//
// While something is being reviewed, re-renders the page from the server every few seconds (only
// while the tab is visible), so the next step appears without a manual refresh. Also offers a button.
import { LoaderCircle, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useTransition } from 'react';
import { buttonClasses } from '@/components/ui/button';
import { useCreatorMessages } from '@/lib/i18n/client';

export function PendingRefresher({ intervalSeconds }: { intervalSeconds: number }) {
  const label = useCreatorMessages().refreshStatus;
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') startTransition(() => router.refresh());
    }, intervalSeconds * 1000);
    return () => clearInterval(timer);
  }, [intervalSeconds, router]);

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      className={buttonClasses({ variant: 'secondary', className: 'mt-5' })}
    >
      {refreshing ? <LoaderCircle aria-hidden className="animate-spin" /> : <RefreshCw aria-hidden />}
      {label}
    </button>
  );
}
