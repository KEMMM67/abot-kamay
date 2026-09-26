// apps/web/components/feed/creator-avatar.tsx
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

/** The creator's initials in a round teal badge (no profile photos: the ID photo is never shown). */
export function CreatorAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-full bg-linear-to-br from-teal-500 to-teal-700 text-sm font-bold text-white ring-2 ring-white',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
