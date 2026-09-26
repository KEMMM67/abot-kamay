// apps/api/src/campaigns/campaign.dto.ts
//
// Public response shapes for campaigns (creator posts). apps/web/lib/types.ts mirrors these; change
// both together. Money is always a decimal string of centavos (BigInt serialized by bigint-json.ts).
import type {
  CampaignStatus,
  CoordinatorTier,
  CreatorRelationship,
  DisbursementMethod,
  FundingType,
  LedgerTxnType,
  MilestoneStatus,
  ProofStatus,
  SpendingProofKind,
} from '../generated/prisma/enums.js';

export type MinorUnits = string;
export type IsoDateTime = string;

/**
 * Language of the text the API writes itself (timeline, verification checks, the excess-funds
 * policy). What creators write (titles, captions, receipts) is shown as written.
 */
export const CONTENT_LANGS = ['fil', 'en'] as const;
export type ContentLang = (typeof CONTENT_LANGS)[number];

export interface BeneficiaryPublicDto {
  /** Name chosen with the person's consent, e.g. "Lolo Ben". Never the legal name. */
  alias: string;
  ageBand: string | null;
  /** City or municipality only, never an exact location. */
  region: string;
  needCategories: string[];
}

export interface PublicMediaDto {
  id: string;
  kind: 'IMAGE' | 'VIDEO';
  /** CDN URL of the moderated, re-encoded, metadata-free copy (H.264 MP4 for videos). */
  url: string;
  /** Videos: a still frame to show before playback starts. Null for photos. */
  posterUrl: string | null;
  altText: string | null;
  /** Pixel size of the public copy, after rotation; the feed sizes the frame from it. */
  width: number | null;
  height: number | null;
  /** Videos only. */
  durationMs: number | null;
}

export interface CreatorPublicDto {
  /** Public name checked against the creator's government ID, e.g. "Ana R." */
  displayName: string;
  kycVerifiedAt: IsoDateTime | null;
  relationship: CreatorRelationship;
}

export interface CreatorBadgeDto extends CreatorPublicDto {
  /** Public posts by this creator, this one included. */
  postsCount: number;
  memberSince: IsoDateTime;
}

export interface CoordinatorBadgeDto {
  displayName: string;
  tier: CoordinatorTier;
  organizationName: string | null;
  identityVerifiedAt: IsoDateTime | null;
  closedCampaigns: number;
  proofComplianceRate: string | null;
}

export interface CampaignSummaryDto {
  id: string;
  slug: string;
  title: string;
  summary: string;
  status: CampaignStatus;
  currency: 'PHP';
  fundingType: FundingType;
  /** Null for OPEN_ENDED campaigns. */
  goalMinor: MinorUnits | null;
  raisedMinor: MinorUnits;
  donorCount: number;
  beneficiary: BeneficiaryPublicDto;
  creator: CreatorPublicDto;
  /** The first public photo or video (link previews, compact cards). Same as media[0]. */
  cover: PublicMediaDto | null;
  /** Up to FEED_MEDIA_LIMIT public photos and videos, in the creator's order, for the feed. */
  media: PublicMediaDto[];
  mediaCount: number;
  /** Spending reports that were not rejected. */
  receiptCount: number;
  publishedAt: IsoDateTime | null;
}

export interface MilestoneDto {
  id: string;
  position: number;
  title: string;
  description: string;
  budgetMinor: MinorUnits | null;
  payoutMethod: DisbursementMethod;
  status: MilestoneStatus;
  proofDueAt: IsoDateTime | null;
}

export type TimelineState = 'DONE' | 'CURRENT' | 'UPCOMING';
export type TimelineKind =
  'CREATOR_VERIFIED' | 'POSTED' | 'REVIEWED' | 'FIELD_VERIFIED' | 'MILESTONE_FUNDED' | 'DISBURSED' | 'PROOF';

export interface TimelineEventDto {
  id: string;
  kind: TimelineKind;
  state: TimelineState;
  title: string;
  detail: string;
  occurredAt: IsoDateTime | null;
}

export interface PublicLedgerEntryDto {
  id: string;
  seq: string;
  type: LedgerTxnType;
  direction: 'IN' | 'OUT';
  amountMinor: MinorUnits;
  currency: 'PHP';
  /** "Anonymous" or a masked name for donations; null otherwise. */
  donorLabel: string | null;
  description: string;
  occurredAt: IsoDateTime;
  hash: string;
  prevHash: string;
}

export interface LedgerSummaryDto {
  receivedMinor: MinorUnits;
  disbursedMinor: MinorUnits;
  heldMinor: MinorUnits;
  /** Total of the creator's spending reports that were not rejected. */
  receiptedMinor: MinorUnits;
  entryCount: number;
  headHash: string;
}

export interface SpendingMediaDto extends PublicMediaDto {
  proofKind: SpendingProofKind;
}

export interface SpendingReportDto {
  id: string;
  title: string;
  note: string | null;
  amountMinor: MinorUnits;
  currency: 'PHP';
  /** Calendar date on the receipt, YYYY-MM-DD. */
  spentOn: string;
  merchantName: string | null;
  milestoneTitle: string | null;
  status: ProofStatus;
  /** Public reason when a report was rejected. */
  reviewNote: string | null;
  /** Receipts and photos appear once reviewed (they can show names or addresses before that). */
  media: SpendingMediaDto[];
  mediaCount: number;
  hash: string;
  prevHash: string;
  postedAt: IsoDateTime;
}

export interface CampaignDetailDto extends CampaignSummaryDto {
  story: string;
  excessFundsPolicy: string;
  closesAt: IsoDateTime | null;
  creator: CreatorBadgeDto;
  coordinator: CoordinatorBadgeDto | null;
  media: PublicMediaDto[];
  verificationChecks: string[];
  milestones: MilestoneDto[];
  timeline: TimelineEventDto[];
  /** Social media posts linked to the campaign. Creator posts are native, so usually empty. */
  sourcePosts: never[];
  ledger: LedgerSummaryDto;
  recentLedger: PublicLedgerEntryDto[];
  spendingReports: SpendingReportDto[];
  spendingReportCount: number;
}

/** A creator's own campaigns, including ones not public yet. */
export interface MyCampaignDto {
  id: string;
  slug: string;
  title: string;
  status: CampaignStatus;
  fundingType: FundingType;
  goalMinor: MinorUnits | null;
  raisedMinor: MinorUnits;
  reviewNote: string | null;
  createdAt: IsoDateTime;
  publishedAt: IsoDateTime | null;
  receiptCount: number;
  isPublic: boolean;
}

export interface CreatedCampaignDto {
  id: string;
  slug: string;
  status: CampaignStatus;
}
