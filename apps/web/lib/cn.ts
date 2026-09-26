// apps/web/lib/cn.ts
import { clsx, type ClassValue } from 'clsx';
import type { CSSProperties } from 'react';
import { twMerge } from 'tailwind-merge';

/** Joins class names and resolves Tailwind conflicts, so the last one wins: cn('px-4', 'px-6') -> 'px-6'. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Inline style that may set CSS custom properties, e.g. { '--i': 2 } for staggered animations. */
export type StyleWithVars = CSSProperties & Record<`--${string}`, string | number>;
