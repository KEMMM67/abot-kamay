// apps/web/components/page-transition.tsx
import { ViewTransition, type ReactNode } from 'react';

/**
 * Wraps a page's content so route changes cross-fade: the old page fades out quickly and the new one
 * rises in (styles in app/globals.css). Next.js runs navigations as transitions, so React starts a
 * browser view transition automatically. Wrap each page, not the layout: layouts persist across
 * navigations, so enter and exit would never fire there.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
