// apps/web/components/ui/section-heading.tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  as: Heading = 'h2',
  className,
}: {
  id?: string;
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  as?: 'h1' | 'h2';
  className?: string;
}) {
  return (
    <div className={cn('max-w-2xl', className)}>
      {eyebrow && <p className="text-sm font-bold uppercase tracking-[0.14em] text-teal-700">{eyebrow}</p>}
      <Heading
        id={id}
        className={cn(
          'font-extrabold tracking-tight text-ink',
          eyebrow && 'mt-3',
          Heading === 'h1' ? 'text-4xl sm:text-5xl' : 'text-3xl sm:text-4xl',
        )}
      >
        {title}
      </Heading>
      {description && <p className="mt-4 text-lg leading-relaxed text-ink-700">{description}</p>}
    </div>
  );
}
