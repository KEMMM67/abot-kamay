// apps/web/components/feed/post-byline.tsx
//
// Who posted, like the top of a social media post: the creator's name with the ID-verified check, how
// they know the person, and when it went live. `onMedia` is the white version drawn over a video.
import { BadgeCheck } from 'lucide-react';
import { StatusChip } from '@/components/ui/status-chip';
import { cn } from '@/lib/cn';
import { formatTimeAgo } from '@/lib/format';
import { getLocale, getMessages } from '@/lib/i18n/server';
import type { CampaignSummary } from '@/lib/types';
import { CreatorAvatar } from './creator-avatar';

export async function PostByline({
  campaign,
  onMedia = false,
  className,
}: {
  campaign: CampaignSummary;
  onMedia?: boolean;
  className?: string;
}) {
  const [t, locale] = await Promise.all([getMessages(), getLocale()]);
  const { creator } = campaign;
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <CreatorAvatar name={creator.displayName} className={onMedia ? 'ring-white/70' : undefined} />
      <div className="min-w-0 flex-1">
        <p className={cn('flex items-center gap-1.5 font-bold', onMedia ? 'text-white' : 'text-ink')}>
          <span className="truncate">{creator.displayName}</span>
          <BadgeCheck
            aria-hidden
            className={cn('size-5 shrink-0', onMedia ? 'text-teal-300' : 'text-teal-600')}
          />
          <span className="sr-only">{t.feed.post.verified}</span>
        </p>
        <p className={cn('truncate text-sm', onMedia ? 'text-white/85' : 'text-ink-600')}>
          {t.labels.relationships[creator.relationship].badge}
          {campaign.publishedAt && <> · {formatTimeAgo(campaign.publishedAt, locale)}</>}
        </p>
      </div>
      {campaign.status === 'FUNDED' && <StatusChip tone="teal">{t.feed.post.goalReached}</StatusChip>}
    </div>
  );
}
