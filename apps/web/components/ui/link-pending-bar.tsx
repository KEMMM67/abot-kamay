// apps/web/components/ui/link-pending-bar.tsx
'use client';

import { useLinkStatus } from 'next/link';
import { cn } from '@/lib/cn';

/**
 * A thin progress bar shown while the enclosing <Link> is navigating. Campaign pages have no loading
 * skeleton (so a missing campaign can answer with a real HTTP 404), and on a slow connection this
 * tells the donor their tap registered. Render it inside a Link; it is absolutely positioned against
 * the nearest positioned ancestor, and always rendered so it never shifts the layout.
 */
export function LinkPendingBar({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-x-0 top-0 z-10 h-1 overflow-hidden opacity-0 transition-opacity duration-200',
        pending && 'opacity-100',
        className,
      )}
    >
      <span className="animate-loading-bar block h-full w-1/3 rounded-full bg-teal-600" />
    </span>
  );
}
