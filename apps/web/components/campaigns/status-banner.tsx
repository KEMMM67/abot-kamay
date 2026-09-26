// apps/web/components/campaigns/status-banner.tsx
//
// Public banner for campaigns that are not taking donations. Coral only for attention states, and
// never red: on a beneficiary's page, red reads as blame (brand/BRAND.md).
import { CircleCheckBig, CirclePause, Info, SearchCheck, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { getMessages } from '@/lib/i18n/server';
import type { CampaignStatus } from '@/lib/types';

type BannerStatus = 'FUNDED' | 'PAUSED' | 'UNDER_INVESTIGATION' | 'CLOSED' | 'CANCELLED';

const BANNERS: Record<BannerStatus, { icon: LucideIcon; tone: string }> = {
  FUNDED: { icon: CircleCheckBig, tone: 'border-teal-200 bg-teal-50 [&_svg]:text-teal-700' },
  PAUSED: { icon: CirclePause, tone: 'border-gold-200 bg-gold-50 [&_svg]:text-gold-700' },
  UNDER_INVESTIGATION: { icon: SearchCheck, tone: 'border-coral-200 bg-coral-50 [&_svg]:text-coral-700' },
  CLOSED: { icon: Info, tone: 'border-ink-200 bg-ink-50 [&_svg]:text-ink-700' },
  CANCELLED: { icon: Info, tone: 'border-ink-200 bg-ink-50 [&_svg]:text-ink-700' },
};

function hasBanner(status: CampaignStatus): status is BannerStatus {
  return Object.hasOwn(BANNERS, status);
}

export async function StatusBanner({ status }: { status: CampaignStatus }) {
  if (!hasBanner(status)) return null;
  const text = (await getMessages()).campaign.banners[status];
  const { icon: Icon, tone } = BANNERS[status];
  return (
    <div className={cn('animate-fade-in flex items-start gap-4 rounded-3xl border p-5', tone)}>
      <Icon aria-hidden className="mt-0.5 size-6 shrink-0" />
      <div>
        <p className="font-bold text-ink">{text.title}</p>
        <p className="mt-1 text-ink-700">{text.body}</p>
      </div>
    </div>
  );
}
