// apps/web/components/motion-provider.tsx
'use client';

import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * Motion for the few interactions CSS can't do well (exit animations, swapping result cards).
 * LazyMotion + `m` components load only the DOM animation features, and `strict` makes a stray
 * full `motion` import a build-time error. reducedMotion="user" drops movement for people who
 * ask their OS for less motion, and keeps simple fades.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
