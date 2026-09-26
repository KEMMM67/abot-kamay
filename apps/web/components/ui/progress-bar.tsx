// apps/web/components/ui/progress-bar.tsx
//
// Funding progress bar. Gold while in progress, teal once the goal is met (brand money states).
// It is decorative: every place that shows it also shows the amounts and percentage as text, so the
// information never depends on the bar or its color, and screen readers don't hear it twice.
import { cn } from '@/lib/cn';
import type { FundingProgress } from '@/lib/money';

export function ProgressBar({
  progress,
  size = 'md',
  className,
}: {
  progress: FundingProgress;
  size?: 'md' | 'lg';
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative w-full overflow-hidden rounded-full bg-ink-100',
        size === 'lg' ? 'h-3.5' : 'h-2.5',
        className,
      )}
    >
      <div
        className={cn(
          'animate-progress-fill h-full origin-left rounded-full',
          progress.complete ? 'bg-teal-600' : 'bg-linear-to-r from-gold-400 to-gold-500',
        )}
        style={{ width: `${progress.fill}%` }}
      />
    </div>
  );
}
