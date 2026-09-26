// apps/web/components/campaigns/campaign-grid.tsx
import { PostCard } from '@/components/feed/post-card';
import { cn } from '@/lib/cn';
import type { CampaignSummary } from '@/lib/types';

/** Posts in a responsive grid (the landing page). The feed page lists them in one column instead. */
export function CampaignGrid({
  campaigns,
  headingLevel,
  className,
}: {
  campaigns: CampaignSummary[];
  headingLevel?: 'h2' | 'h3';
  className?: string;
}) {
  return (
    <ul className={cn('grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8', className)}>
      {campaigns.map((campaign, index) => (
        <li key={campaign.id} className="h-full">
          <PostCard campaign={campaign} index={index} headingLevel={headingLevel} />
        </li>
      ))}
    </ul>
  );
}
