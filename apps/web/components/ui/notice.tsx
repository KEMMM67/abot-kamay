// apps/web/components/ui/notice.tsx
import { CloudOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Friendly inline message for when a section can't load. Never blames the donor. */
export function Notice({
  title,
  children,
  action,
  className,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-4 rounded-3xl border-2 border-dashed border-ink-200 bg-white p-6 sm:flex-row sm:items-center',
        className,
      )}
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-cream-200 text-ink-700">
        <CloudOff aria-hidden className="size-6" />
      </span>
      <div className="flex-1">
        <p className="font-bold text-ink">{title}</p>
        {children && <p className="mt-1 text-ink-700">{children}</p>}
      </div>
      {action}
    </div>
  );
}
