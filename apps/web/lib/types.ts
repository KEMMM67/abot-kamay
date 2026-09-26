// apps/web/lib/types.ts
//
// Contract between the web app and the AbotKamay API (/api/v1). The enums mirror
// apps/api/prisma/schema.prisma and the response shapes mirror apps/api/src/campaigns/campaign.dto.ts
// and apps/api/src/auth/viewer.service.ts; change them together.
//
// Money is always a decimal string in minor units (centavos), because the API serializes BigInt as a
// string (apps/api/src/common/http/bigint-json.ts). Never convert it to a JS number; use lib/money.ts.

/** Amount in centavos as a decimal string: "50000" is PHP 500.00. */
export type MinorUnits = string;

/** ISO 8601 timestamp in UTC, e.g. "2026-09-25T02:30:00.000Z". */
export type IsoDateTime = string;

/** Calendar date, e.g. "2026-09-24". */
export type IsoDate = string;

export type CampaignStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'ACTIVE'
  | 'PAUSED'
  | 'FUNDED'
  | 'UNDER_INVESTIGATION'
  | 'CLOSED'
  | 'CANCELLED';

/** FIXED: an exact goal (e.g. a hospital bill). OPEN_ENDED: no goal (e.g. groceries). */
export type FundingType = 'FIXED' | 'OPEN_ENDED';

export type CoordinatorTier =
  'TIER0_REGISTERED' | 'TIER1_IDENTITY' | 'TIER2_FIELD' | 'TIER3_ORG_BACKED' | 'TIER4_TRUSTED';

export type MilestoneStatus =
  | 'PLANNED'
  | 'FUNDED'
  | 'DISBURSEMENT_REQUESTED'
  | 'DISBURSED'
  | 'PROOF_SUBMITTED'
  | 'PROOF_VERIFIED'
  | 'PROOF_OVERDUE';

export type DisbursementMethod =
  'VENDOR_DIRECT' | 'BENEFICIARY_EWALLET' | 'BENEFICIARY_BANK' | 'COORDINATOR_PAYOUT' | 'CREATOR_PAYOUT';

export type Platform = 'TIKTOK' | 'FACEBOOK' | 'INSTAGRAM' | 'YOUTUBE' | 'X' | 'OTHER';

export type LedgerTxnType =
  | 'DONATION_CAPTURED'
  | 'PROCESSOR_FEE'
  | 'PLATFORM_FEE'
  | 'DISBURSEMENT'
  | 'REFUND'
  | 'CHARGEBACK'
  | 'CHARGEBACK_REVERSAL'
  | 'RESERVE_TRANSFER'
  | 'ADJUSTMENT';

export type PaymentMethod = 'GCASH' | 'MAYA' | 'CARD';

/** Need categories the UI styles. The database stores free-form strings; unknown ones fall back. */
export type NeedCategory = 'MOBILITY' | 'MEDICAL' | 'LIVELIHOOD' | 'HOUSING' | 'FOOD' | 'EDUCATION';

export const NEED_CATEGORIES: readonly NeedCategory[] = [
  'MEDICAL',
  'FOOD',
  'LIVELIHOOD',
  'HOUSING',
  'MOBILITY',
  'EDUCATION',
];

/** How the creator knows the person in the post. */
export type CreatorRelationship =
  'SELF' | 'FAMILY' | 'FRIEND_OR_NEIGHBOR' | 'COMMUNITY_WORKER' | 'PASSERBY' | 'OTHER';

export type KycStatus = 'UNVERIFIED' | 'PENDING_ID' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'REVOKED';

export type IdentityCheckStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';

export type GovernmentIdType =
  'PHILSYS' | 'PASSPORT' | 'DRIVERS_LICENSE' | 'UMID' | 'SSS' | 'PRC' | 'POSTAL' | 'VOTERS';

export type ConsentMethod = 'SELF' | 'VIDEO' | 'SIGNED_FORM' | 'GUARDIAN';

/** Who receives a plan item's money: the verified creator, or the hospital/store directly. */
export type PayoutChoice = 'CREATOR' | 'DIRECT_TO_PROVIDER';

export type SpendingProofKind = 'RECEIPT' | 'ITEM_PHOTO' | 'HANDOVER_PHOTO';

export type ProofStatus = 'SUBMITTED' | 'AI_CHECKED' | 'VERIFIED' | 'REJECTED';

export type UploadPurpose = 'POST_MEDIA' | 'CONSENT_EVIDENCE' | 'KYC_DOCUMENT' | 'SPENDING_PROOF';

/** Cursor pagination, used by every list endpoint. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface BeneficiaryPublic {
  /** Name chosen with the person's consent, e.g. "Lolo Ben". Never the legal name. */
  alias: string;
  /** Age band instead of a birth date, e.g. "70-79". */
  ageBand: string | null;
  /** City or municipality only, never an exact location. */
  region: string;
  needCategories: NeedCategory[];
}

/**
 * A moderated photo or video from the media CDN: re-encoded by the media worker with every piece of
 * metadata (GPS included) removed. Videos are H.264 MP4 with a poster frame.
 */
export interface PublicMedia {
  id: string;
  kind: 'IMAGE' | 'VIDEO';
  url: string;
  /** Videos: a still frame to show before playback. Null for photos. */
  posterUrl: string | null;
  altText: string | null;
  /** Pixel size as displayed; the feed sizes each frame from it. */
  width: number | null;
  height: number | null;
  /** Videos only. */
  durationMs: number | null;
}

export interface CreatorPublic {
  /** Public name checked against the creator's government ID, e.g. "Ana R." */
  displayName: string;
  kycVerifiedAt: IsoDateTime | null;
  relationship: CreatorRelationship;
}

export interface CreatorBadge extends CreatorPublic {
  /** Public posts by this creator, this one included. */
  postsCount: number;
  memberSince: IsoDateTime;
}

export interface CoordinatorBadge {
  /** First name and initial, e.g. "Ana R." */
  displayName: string;
  tier: CoordinatorTier;
  organizationName: string | null;
  identityVerifiedAt: IsoDateTime | null;
  closedCampaigns: number;
  /** Share of disbursements with on-time proof, 0 to 1 as a decimal string ("1.0000"). */
  proofComplianceRate: string | null;
}

export interface CampaignSummary {
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
  beneficiary: BeneficiaryPublic;
  creator: CreatorPublic;
  /** The first public photo or video (link previews, compact cards). Same as media[0]. */
  cover: PublicMedia | null;
  /** Up to 4 public photos and videos in the creator's order: the feed's collage or video. */
  media: PublicMedia[];
  /** Every public photo and video of the post (the feed shows "+N" beyond the first four). */
  mediaCount: number;
  /** Spending reports the creator posted that were not rejected. */
  receiptCount: number;
  publishedAt: IsoDateTime | null;
}

export interface Milestone {
  id: string;
  position: number;
  title: string;
  description: string;
  /** Null for open-ended plan items. */
  budgetMinor: MinorUnits | null;
  payoutMethod: DisbursementMethod;
  status: MilestoneStatus;
  /** Set once money is released: when proof of spending is due. */
  proofDueAt: IsoDateTime | null;
}

export type TimelineState = 'DONE' | 'CURRENT' | 'UPCOMING';

export type TimelineKind =
  'CREATOR_VERIFIED' | 'POSTED' | 'REVIEWED' | 'FIELD_VERIFIED' | 'MILESTONE_FUNDED' | 'DISBURSED' | 'PROOF';

export interface TimelineEvent {
  id: string;
  kind: TimelineKind;
  state: TimelineState;
  title: string;
  detail: string;
  occurredAt: IsoDateTime | null;
}

export interface SourcePost {
  platform: Platform;
  /** Null when the post is no longer available on the platform. */
  url: string | null;
  authorHandle: string | null;
  postedAt: IsoDateTime | null;
  /** The original poster proved ownership and confirmed this is the official campaign. */
  creatorConfirmed: boolean;
}

export interface PublicLedgerEntry {
  id: string;
  /** Global ledger sequence number (BigInt as a string). */
  seq: string;
  type: LedgerTxnType;
  direction: 'IN' | 'OUT';
  amountMinor: MinorUnits;
  currency: 'PHP';
  /** "Anonymous" or a masked name such as "Maria S."; null for entries that are not donations. */
  donorLabel: string | null;
  description: string;
  occurredAt: IsoDateTime;
  /** sha256 over the entry's canonical content plus prevHash. */
  hash: string;
  /** "GENESIS" for the first entry of a campaign's chain. */
  prevHash: string;
}

export interface LedgerSummary {
  receivedMinor: MinorUnits;
  disbursedMinor: MinorUnits;
  heldMinor: MinorUnits;
  /** Total of the creator's spending reports that were not rejected. */
  receiptedMinor: MinorUnits;
  entryCount: number;
  /** Hash of the newest entry: the head of this campaign's chain. */
  headHash: string;
}

export interface SpendingMedia extends PublicMedia {
  proofKind: SpendingProofKind;
}

/** A creator's proof of spending: what was bought, how much, when, with receipts and photos. */
export interface SpendingReport {
  id: string;
  title: string;
  note: string | null;
  amountMinor: MinorUnits;
  currency: 'PHP';
  spentOn: IsoDate;
  merchantName: string | null;
  milestoneTitle: string | null;
  status: ProofStatus;
  /** Public reason when a report was rejected. */
  reviewNote: string | null;
  /** Receipts appear once reviewed (they can show names or addresses before that). */
  media: SpendingMedia[];
  mediaCount: number;
  hash: string;
  prevHash: string;
  postedAt: IsoDateTime;
}

export interface CampaignDetail extends CampaignSummary {
  story: string;
  excessFundsPolicy: string;
  closesAt: IsoDateTime | null;
  creator: CreatorBadge;
  /** Optional field verification on top of the creator's own. */
  coordinator: CoordinatorBadge | null;
  media: PublicMedia[];
  /** Plain-language list of what AbotKamay checked. */
  verificationChecks: string[];
  milestones: Milestone[];
  timeline: TimelineEvent[];
  sourcePosts: SourcePost[];
  ledger: LedgerSummary;
  /** The newest few ledger entries, for the campaign page preview. */
  recentLedger: PublicLedgerEntry[];
  /** The newest few spending reports. */
  spendingReports: SpendingReport[];
  spendingReportCount: number;
}

/** GET /ledger/verify/{receiptRef}: proof that a donation is in the public ledger. */
export interface LedgerVerification {
  entry: PublicLedgerEntry;
  inclusionProof: { merkleRoot: string; path: string[]; anchoredAt: IsoDateTime | null };
}

export type ChannelVerdict = 'VERIFIED' | 'REPORTED' | 'NOT_FOUND';

/** POST /channels/check: the "Is this legit?" lookup. */
export interface ChannelCheckRequest {
  kind: 'EWALLET_NUMBER';
  /** E.164 Philippine mobile number, e.g. "+639171234567". */
  value: string;
}

export type ChannelCheckResult =
  | {
      verdict: 'VERIFIED';
      checkedValue: string;
      provider: 'GCASH' | 'MAYA' | null;
      /** Registered name as the e-wallet app shows it, e.g. "BE****O M." */
      accountNameMasked: string | null;
      verifiedAt: IsoDateTime;
      campaign: { slug: string; title: string; beneficiaryAlias: string; status: CampaignStatus };
    }
  | {
      verdict: 'REPORTED';
      checkedValue: string;
      reportCount: number;
      firstReportedAt: IsoDateTime;
      lastReportedAt: IsoDateTime;
    }
  | { verdict: 'NOT_FOUND'; checkedValue: string };

/** POST /campaigns/{id}/donations (requires an Idempotency-Key header). */
export interface CreateDonationRequest {
  amountMinor: MinorUnits;
  paymentMethod: PaymentMethod;
  anonymous: boolean;
  email: string;
}

export interface CreateDonationResponse {
  donationId: string;
  /** Provider-hosted checkout page. Card data never touches AbotKamay servers. */
  checkoutUrl: string;
  amountMinor: MinorUnits;
  tipMinor: MinorUnits;
  totalMinor: MinorUnits;
}

// --------------------------------------------------------------------------- Accounts and creators

/** The signed-in user (GET /me). */
export interface Viewer {
  id: string;
  displayName: string | null;
  phoneMasked: string | null;
  /** EXPIRED once a verification has lapsed. */
  kycStatus: KycStatus;
  kycVerifiedAt: IsoDateTime | null;
  kycExpiresAt: IsoDateTime | null;
  /** The KYC front gate: true only when this user may post and receive funds right now. */
  canPost: boolean;
  latestVerification: {
    id: string;
    status: IdentityCheckStatus;
    idType: GovernmentIdType;
    submittedAt: IsoDateTime;
    decidedAt: IsoDateTime | null;
    rejectionReason: string | null;
  } | null;
}

/** POST /auth/otp */
export interface OtpRequested {
  challengeId: string;
  expiresAt: IsoDateTime;
  phoneMasked: string;
  /** Only from an API running with SMS_PROVIDER=log (development and test): the code, shown on screen. */
  devCode?: string;
}

/** POST /auth/otp/verify */
export interface SignInResponse {
  token: string;
  expiresAt: IsoDateTime;
  viewer: Viewer;
}

/** POST /kyc/challenge */
export interface KycChallenge {
  challengeCode: string;
  challengeToken: string;
  expiresAt: IsoDateTime;
}

export interface SubmitKycRequest {
  idType: GovernmentIdType;
  displayName: string;
  challengeToken: string;
  documents: { idFront: string; idBack?: string; selfieWithId: string };
  consent: { dataProcessing: true; truthful: true };
}

/** POST /uploads */
export interface CreateUploadRequest {
  purpose: UploadPurpose;
  mimeType: string;
  byteSize: number;
  /** Lowercase hex SHA-256 of the file. Storage rejects an upload whose bytes don't match it. */
  sha256: string;
}

export interface UploadIntent {
  mediaId: string;
  kind: 'IMAGE' | 'VIDEO';
  /** Presigned PUT straight to object storage (S3 or R2); the file never passes through the API. */
  upload: { url: string; method: 'PUT'; headers: Record<string, string> };
  expiresAt: IsoDateTime;
}

/** POST /campaigns */
export interface CreateCampaignRequest {
  title: string;
  caption: string;
  fundingType: FundingType;
  plan: Array<{ title: string; description?: string; amountMinor?: MinorUnits; payout: PayoutChoice }>;
  relationship: CreatorRelationship;
  beneficiary: {
    alias: string;
    ageBand?: string;
    region: string;
    needCategories: NeedCategory[];
    isMinor: boolean;
  };
  media: Array<{ mediaId: string; altText?: string; showsMinor: boolean }>;
  consent: { method: ConsentMethod; evidenceMediaId?: string };
  attestation: true;
}

export interface CreatedCampaign {
  id: string;
  slug: string;
  status: CampaignStatus;
}

/** GET /me/campaigns: the creator's own posts, including ones still in review. */
export interface MyCampaign {
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

/** POST /campaigns/{slug}/spending-reports */
export interface CreateSpendingReportRequest {
  title: string;
  note?: string;
  amountMinor: MinorUnits;
  spentOn: IsoDate;
  merchantName?: string;
  milestoneId?: string;
  media: Array<{ mediaId: string; kind: SpendingProofKind }>;
  attestation: true;
}

export interface HealthLive {
  status: 'ok';
  service: 'abotkamay-api';
}

export interface HealthReady {
  status: 'ok';
  database: 'up';
}
