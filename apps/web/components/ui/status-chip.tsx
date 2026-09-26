// apps/web/components/ui/status-chip.tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { Tone } from '@/lib/format';

// Dark text on a light tint of each tone: every pair is above 6:1.
const TONES: Record<Tone, string> = {
  teal: 'bg-teal-50 text-teal-800 ring-teal-200',
  gold: 'bg-gold-50 text-gold-800 ring-gold-200',
  coral: 'bg-coral-50 text-coral-800 ring-coral-200',
  neutral: 'bg-ink-50 text-ink-700 ring-ink-200',
};

export function StatusChip({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset [&_svg]:size-4',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
