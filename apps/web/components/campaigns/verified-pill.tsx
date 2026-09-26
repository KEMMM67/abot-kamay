// apps/web/components/campaigns/verified-pill.tsx
import { ShieldCheck } from 'lucide-react';
import { StatusChip } from '@/components/ui/status-chip';
import { getMessages } from '@/lib/i18n/server';

/** Every creator passed a government ID check before posting (the KYC front gate). */
export async function VerifiedPill({ className }: { className?: string }) {
  const t = await getMessages();
  return (
    <StatusChip tone="teal" className={className}>
      <ShieldCheck aria-hidden />
      {t.campaign.verifiedPill}
    </StatusChip>
  );
}
