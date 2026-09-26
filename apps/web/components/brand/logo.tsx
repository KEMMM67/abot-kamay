// apps/web/components/brand/logo.tsx
//
// The AbotKamay mark (brand/abotkamay-mark.svg): two reaching hands form a heart around a gold dot,
// the person being helped. The fingertips almost touch but never close; keep that gap.
// With `animated`, the hands draw upward from the base and the dot appears between them.
import { cn } from '@/lib/cn';

export function LogoMark({ className, animated = false }: { className?: string; animated?: boolean }) {
  const hand = animated ? 'animate-draw [stroke-dasharray:1_1] [stroke-dashoffset:1]' : undefined;
  return (
    <svg viewBox="0 0 128 128" aria-hidden className={cn('shrink-0', className)}>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={14}>
        {/* Left hand: Bayanihan Teal */}
        <path
          d="M64 108 C40 92 16 74 16 52 C16 36 26 24 40 24 C50 24 56 29 58 36"
          stroke="#0E7C6B"
          pathLength={1}
          className={cn(hand, animated && 'animation-delay-150')}
        />
        {/* Right hand: Kalinga Coral */}
        <path
          d="M64 108 C88 92 112 74 112 52 C112 36 102 24 88 24 C78 24 72 29 70 36"
          stroke="#E0603A"
          pathLength={1}
          className={cn(hand, animated && 'animation-delay-300')}
        />
      </g>
      {/* The person being helped, held within reach: Sunrise Gold */}
      <circle
        cx="64"
        cy="63"
        r="12"
        fill="#F2B632"
        className={cn(animated && 'animate-pop animation-delay-1200 origin-center [transform-box:fill-box]')}
      />
    </svg>
  );
}

/**
 * Horizontal lockup: mark + wordmark. Minimum width 120px (brand rule). `compact` shows only the mark
 * on the narrowest phones (under 360px), where the navbar also holds the language toggle; the link
 * around it carries the name for screen readers.
 */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark className="size-9" />
      <span
        className={cn(
          'text-[1.375rem] font-extrabold leading-none tracking-tight',
          compact && 'max-[359px]:hidden',
        )}
      >
        <span className="text-ink">Abot</span>
        <span className="text-teal-600">Kamay</span>
      </span>
    </span>
  );
}
