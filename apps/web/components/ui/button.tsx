// apps/web/components/ui/button.tsx
//
// Buttons and button-styled links. Every size is at least 48px tall, well over the 24px minimum
// target size in WCAG 2.2 and comfortable for older hands.
import type { Route } from 'next';
import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'light';
type Size = 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  // White on Bayanihan Teal: 5.1:1.
  primary: 'bg-teal-600 text-white shadow-cta hover:bg-teal-700',
  secondary: 'border-2 border-ink-200 bg-white text-ink hover:border-teal-600 hover:text-teal-800',
  ghost: 'text-ink-700 hover:bg-ink-50 hover:text-ink',
  // For dark (Ink) panels.
  light: 'bg-cream text-ink hover:bg-white',
};

const SIZES: Record<Size, string> = {
  md: 'min-h-12 gap-2 px-5 py-2.5 text-base [&_svg]:size-5',
  lg: 'min-h-14 gap-2.5 px-7 py-3 text-lg [&_svg]:size-5',
};

export interface ButtonStyleProps {
  variant?: Variant;
  size?: Size;
  className?: string;
}

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  className,
}: ButtonStyleProps = {}): string {
  return cn(
    'pressable group/button inline-flex select-none items-center justify-center rounded-2xl text-center font-semibold leading-snug',
    'disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:shrink-0',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export function Button({
  variant,
  size,
  className,
  type = 'button',
  ...props
}: ComponentProps<'button'> & ButtonStyleProps) {
  return <button type={type} className={buttonClasses({ variant, size, className })} {...props} />;
}

type ButtonLinkProps<T extends string> = Omit<ComponentProps<'a'>, 'href'> &
  ButtonStyleProps & {
    href: Route<T>;
    prefetch?: boolean;
    transitionTypes?: string[];
  };

export function ButtonLink<T extends string>({
  href,
  variant,
  size,
  className,
  ...props
}: ButtonLinkProps<T>) {
  return <Link href={href} className={buttonClasses({ variant, size, className })} {...props} />;
}

/** Arrow that nudges forward when its button or link is hovered. */
export function ArrowNudge({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      fill="none"
      className={cn(
        'transition-transform duration-300 ease-out-expo group-hover/button:translate-x-1 group-hover:translate-x-1',
        className,
      )}
    >
      <path
        d="M4 10h11m0 0-4.5-4.5M15 10l-4.5 4.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
