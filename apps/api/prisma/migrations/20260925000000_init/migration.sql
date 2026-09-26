-- 20260925000000_init/migration.sql
-- AbotKamay initial schema. Generated with:
--   prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
-- plus the pgvector extension, which must exist before the vector(1024) columns are created.
-- Neon supports pgvector natively (extension name: vector).

CREATE EXTENSION IF NOT EXISTS vector;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "role" AS ENUM ('DONOR', 'SUBMITTER', 'COORDINATOR', 'ORG_ADMIN', 'REVIEWER', 'FINANCE', 'ADMIN', 'AUDITOR');

-- CreateEnum
CREATE TYPE "account_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED', 'DELETED');

-- CreateEnum
CREATE TYPE "kyc_status" AS ENUM ('NOT_STARTED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "coordinator_tier" AS ENUM ('TIER0_REGISTERED', 'TIER1_IDENTITY', 'TIER2_FIELD', 'TIER3_ORG_BACKED', 'TIER4_TRUSTED');

-- CreateEnum
CREATE TYPE "platform" AS ENUM ('TIKTOK', 'FACEBOOK', 'INSTAGRAM', 'YOUTUBE', 'X', 'OTHER');

-- CreateEnum
CREATE TYPE "submission_status" AS ENUM ('RECEIVED', 'AUTO_REJECTED', 'DUPLICATE', 'NEEDS_TRIAGE', 'NEEDS_INFO', 'VERIFICATION_OPENED', 'REJECTED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "verification_status" AS ENUM ('OPEN', 'ASSIGNED', 'FIELD_VISIT_DONE', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'UNVERIFIABLE', 'DECLINED_BY_BENEFICIARY');

-- CreateEnum
CREATE TYPE "beneficiary_status" AS ENUM ('ACTIVE', 'WITHDRAWN', 'DECEASED', 'MERGED');

-- CreateEnum
CREATE TYPE "evidence_type" AS ENUM ('PROOF_OF_PRESENCE', 'CONSENT_RECORDING', 'ID_DOCUMENT', 'COMMUNITY_ATTESTATION', 'NEEDS_ASSESSMENT_MEDIA', 'OTHER');

-- CreateEnum
CREATE TYPE "media_visibility" AS ENUM ('QUARANTINE', 'RESTRICTED', 'PUBLIC');

-- CreateEnum
CREATE TYPE "moderation_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_HUMAN');

-- CreateEnum
CREATE TYPE "campaign_status" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'PAUSED', 'FUNDED', 'UNDER_INVESTIGATION', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "milestone_status" AS ENUM ('PLANNED', 'FUNDED', 'DISBURSEMENT_REQUESTED', 'DISBURSED', 'PROOF_SUBMITTED', 'PROOF_VERIFIED', 'PROOF_OVERDUE');

-- CreateEnum
CREATE TYPE "donation_status" AS ENUM ('PENDING', 'REQUIRES_ACTION', 'SUCCEEDED', 'FAILED', 'CANCELED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "refund_status" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "payment_provider" AS ENUM ('PAYMONGO', 'XENDIT', 'STRIPE', 'PAYPAL');

-- CreateEnum
CREATE TYPE "ledger_account_type" AS ENUM ('ASSET', 'LIABILITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "entry_direction" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "ledger_txn_type" AS ENUM ('DONATION_CAPTURED', 'PROCESSOR_FEE', 'PLATFORM_FEE', 'DISBURSEMENT', 'REFUND', 'CHARGEBACK', 'CHARGEBACK_REVERSAL', 'RESERVE_TRANSFER', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "disbursement_method" AS ENUM ('VENDOR_DIRECT', 'BENEFICIARY_EWALLET', 'BENEFICIARY_BANK', 'COORDINATOR_PAYOUT');

-- CreateEnum
CREATE TYPE "disbursement_status" AS ENUM ('REQUESTED', 'APPROVED_L1', 'APPROVED', 'PROCESSING', 'PAID', 'FAILED', 'CANCELED', 'RECONCILED');

-- CreateEnum
CREATE TYPE "proof_status" AS ENUM ('SUBMITTED', 'AI_CHECKED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "actor_type" AS ENUM ('USER', 'SYSTEM', 'AI');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "phone_e164" TEXT,
    "display_name" TEXT,
    "roles" "role"[] DEFAULT ARRAY['DONOR']::"role"[],
    "status" "account_status" NOT NULL DEFAULT 'ACTIVE',
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "kyc_status" "kyc_status" NOT NULL DEFAULT 'NOT_STARTED',
    "kyc_provider_ref" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "registration_number" TEXT NOT NULL,
    "org_type" TEXT NOT NULL,
    "country" CHAR(2) NOT NULL DEFAULT 'PH',
    "verified_at" TIMESTAMPTZ(3),
    "payout_account_ref" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coordinator_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID,
    "tier" "coordinator_tier" NOT NULL DEFAULT 'TIER0_REGISTERED',
    "languages" TEXT[],
    "service_area_label" TEXT,
    "payout_account_ref" TEXT,
    "payout_details_locked_until" TIMESTAMPTZ(3),
    "proof_compliance_rate" DECIMAL(5,4),
    "max_active_campaigns" INTEGER NOT NULL DEFAULT 1,
    "monthly_disbursement_limit_minor" BIGINT NOT NULL DEFAULT 0,
    "suspended_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "coordinator_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beneficiaries" (
    "id" UUID NOT NULL,
    "public_slug" TEXT NOT NULL,
    "public_alias" TEXT NOT NULL,
    "age_band" TEXT,
    "public_region" TEXT NOT NULL,
    "need_categories" TEXT[],
    "status" "beneficiary_status" NOT NULL DEFAULT 'ACTIVE',
    "merged_into_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "beneficiaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beneficiary_private" (
    "beneficiary_id" UUID NOT NULL,
    "legal_name_enc" BYTEA NOT NULL,
    "legal_name_blind_idx" TEXT,
    "exact_location_enc" BYTEA,
    "contact_enc" BYTEA,
    "id_document_ref_enc" BYTEA,
    "guardian_enc" BYTEA,
    "data_key_ref" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "beneficiary_private_pkey" PRIMARY KEY ("beneficiary_id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "beneficiary_id" UUID NOT NULL,
    "captured_by_user_id" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "scopes" TEXT[],
    "evidence_media_id" UUID,
    "captured_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "uploader_id" UUID NOT NULL,
    "visibility" "media_visibility" NOT NULL DEFAULT 'QUARANTINE',
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "p_hash" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "duration_ms" INTEGER,
    "exif_stripped" BOOLEAN NOT NULL DEFAULT false,
    "malware_scan" TEXT NOT NULL DEFAULT 'PENDING',
    "moderation" "moderation_status" NOT NULL DEFAULT 'PENDING',
    "embedding" vector(1024),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_posts" (
    "id" UUID NOT NULL,
    "platform" "platform" NOT NULL,
    "platform_post_id" TEXT NOT NULL,
    "canonical_url" TEXT NOT NULL,
    "author_handle" TEXT,
    "author_platform_id" TEXT,
    "caption_text" TEXT,
    "posted_at" TIMESTAMPTZ(3),
    "embed_html" TEXT,
    "thumbnail_p_hash" TEXT,
    "embedding" vector(1024),
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "last_checked_at" TIMESTAMPTZ(3),
    "creator_user_id" UUID,
    "creator_claimed_at" TIMESTAMPTZ(3),
    "beneficiary_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "tracking_code" TEXT NOT NULL,
    "submitted_by_id" UUID NOT NULL,
    "social_post_id" UUID NOT NULL,
    "submitter_notes" TEXT,
    "location_hint" TEXT,
    "urgency" INTEGER NOT NULL DEFAULT 0,
    "status" "submission_status" NOT NULL DEFAULT 'RECEIVED',
    "ai_risk_score" DECIMAL(5,4),
    "ai_summary" JSONB,
    "triaged_by_id" UUID,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_cases" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "beneficiary_id" UUID,
    "coordinator_id" UUID,
    "status" "verification_status" NOT NULL DEFAULT 'OPEN',
    "challenge_code" TEXT,
    "challenge_expires_at" TIMESTAMPTZ(3),
    "due_at" TIMESTAMPTZ(3),
    "field_visit_at" TIMESTAMPTZ(3),
    "needs_assessment" JSONB,
    "first_reviewer_id" UUID,
    "second_reviewer_id" UUID,
    "decision_notes" TEXT,
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verification_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_evidence" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "type" "evidence_type" NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "captured_at" TIMESTAMPTZ(3) NOT NULL,
    "capture_lat" DECIMAL(9,6),
    "capture_lng" DECIMAL(9,6),
    "device_attestation" JSONB,
    "client_sha256" TEXT NOT NULL,
    "ai_checks" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "beneficiary_id" UUID NOT NULL,
    "coordinator_id" UUID NOT NULL,
    "organization_id" UUID,
    "title" TEXT NOT NULL,
    "story" TEXT NOT NULL,
    "story_translations" JSONB,
    "currency" CHAR(3) NOT NULL DEFAULT 'PHP',
    "goal_minor" BIGINT NOT NULL,
    "raised_minor" BIGINT NOT NULL DEFAULT 0,
    "status" "campaign_status" NOT NULL DEFAULT 'DRAFT',
    "excess_funds_policy" TEXT NOT NULL,
    "verified_at" TIMESTAMPTZ(3),
    "published_at" TIMESTAMPTZ(3),
    "closes_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestones" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "budget_minor" BIGINT NOT NULL,
    "payout_method" "disbursement_method" NOT NULL,
    "status" "milestone_status" NOT NULL DEFAULT 'PLANNED',
    "proof_due_days" INTEGER NOT NULL DEFAULT 7,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_updates" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "milestone_id" UUID,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "media_asset_ids" TEXT[],
    "moderation" "moderation_status" NOT NULL DEFAULT 'PENDING',
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donations" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "donor_user_id" UUID,
    "donor_email_hash" TEXT,
    "display_name" TEXT,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT,
    "currency" CHAR(3) NOT NULL DEFAULT 'PHP',
    "amount_minor" BIGINT NOT NULL,
    "tip_minor" BIGINT NOT NULL DEFAULT 0,
    "processor_fee_minor" BIGINT,
    "provider" "payment_provider" NOT NULL,
    "provider_payment_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "status" "donation_status" NOT NULL DEFAULT 'PENDING',
    "receipt_number" TEXT,
    "ledger_txn_id" UUID,
    "risk_score" DECIMAL(5,4),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "donations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "donation_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "provider_refund_id" TEXT,
    "status" "refund_status" NOT NULL DEFAULT 'PENDING',
    "initiated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhook_events" (
    "id" UUID NOT NULL,
    "provider" "payment_provider" NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "signature_valid" BOOLEAN NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "type" "ledger_account_type" NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'PHP',
    "campaign_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_transactions" (
    "id" UUID NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "type" "ledger_txn_type" NOT NULL,
    "reference_type" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "chain_key" TEXT NOT NULL,
    "prev_hash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "direction" "entry_direction" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_anchors" (
    "id" UUID NOT NULL,
    "period_start" TIMESTAMPTZ(3) NOT NULL,
    "period_end" TIMESTAMPTZ(3) NOT NULL,
    "merkle_root" TEXT NOT NULL,
    "chain_heads" JSONB NOT NULL,
    "signature" TEXT NOT NULL,
    "published_url" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_anchors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disbursements" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "milestone_id" UUID NOT NULL,
    "method" "disbursement_method" NOT NULL,
    "payee_type" TEXT NOT NULL,
    "payee_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'PHP',
    "amount_minor" BIGINT NOT NULL,
    "status" "disbursement_status" NOT NULL DEFAULT 'REQUESTED',
    "requested_by_id" UUID NOT NULL,
    "approver1_id" UUID,
    "approver2_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "provider_payout_id" TEXT,
    "proof_due_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "disbursements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disbursement_proofs" (
    "id" UUID NOT NULL,
    "disbursement_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "ocr_extract" JSONB,
    "receipt_total_minor" BIGINT,
    "ai_findings" JSONB,
    "status" "proof_status" NOT NULL DEFAULT 'SUBMITTED',
    "reviewed_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disbursement_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_invocations" (
    "id" UUID NOT NULL,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "output" JSONB,
    "stop_reason" TEXT,
    "latency_ms" INTEGER NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "target_type" TEXT,
    "target_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_invocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_type" "actor_type" NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "request_id" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" BIGSERIAL NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "message_group" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_messages" (
    "consumer" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_messages_pkey" PRIMARY KEY ("consumer","message_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_e164_key" ON "users"("phone_e164");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_country_registration_number_key" ON "organizations"("country", "registration_number");

-- CreateIndex
CREATE UNIQUE INDEX "coordinator_profiles_user_id_key" ON "coordinator_profiles"("user_id");

-- CreateIndex
CREATE INDEX "coordinator_profiles_organization_id_idx" ON "coordinator_profiles"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "beneficiaries_public_slug_key" ON "beneficiaries"("public_slug");

-- CreateIndex
CREATE INDEX "beneficiary_private_legal_name_blind_idx_idx" ON "beneficiary_private"("legal_name_blind_idx");

-- CreateIndex
CREATE INDEX "consent_records_beneficiary_id_idx" ON "consent_records"("beneficiary_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storage_key_key" ON "media_assets"("storage_key");

-- CreateIndex
CREATE INDEX "media_assets_sha256_idx" ON "media_assets"("sha256");

-- CreateIndex
CREATE INDEX "media_assets_p_hash_idx" ON "media_assets"("p_hash");

-- CreateIndex
CREATE INDEX "social_posts_beneficiary_id_idx" ON "social_posts"("beneficiary_id");

-- CreateIndex
CREATE INDEX "social_posts_thumbnail_p_hash_idx" ON "social_posts"("thumbnail_p_hash");

-- CreateIndex
CREATE UNIQUE INDEX "social_posts_platform_platform_post_id_key" ON "social_posts"("platform", "platform_post_id");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_tracking_code_key" ON "submissions"("tracking_code");

-- CreateIndex
CREATE INDEX "submissions_status_urgency_created_at_idx" ON "submissions"("status", "urgency", "created_at");

-- CreateIndex
CREATE INDEX "submissions_social_post_id_idx" ON "submissions"("social_post_id");

-- CreateIndex
CREATE INDEX "submissions_submitted_by_id_idx" ON "submissions"("submitted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "verification_cases_submission_id_key" ON "verification_cases"("submission_id");

-- CreateIndex
CREATE INDEX "verification_cases_status_due_at_idx" ON "verification_cases"("status", "due_at");

-- CreateIndex
CREATE INDEX "verification_cases_coordinator_id_status_idx" ON "verification_cases"("coordinator_id", "status");

-- CreateIndex
CREATE INDEX "verification_cases_beneficiary_id_idx" ON "verification_cases"("beneficiary_id");

-- CreateIndex
CREATE INDEX "verification_evidence_case_id_idx" ON "verification_evidence"("case_id");

-- CreateIndex
CREATE INDEX "verification_evidence_media_asset_id_idx" ON "verification_evidence"("media_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_slug_key" ON "campaigns"("slug");

-- CreateIndex
CREATE INDEX "campaigns_status_published_at_idx" ON "campaigns"("status", "published_at");

-- CreateIndex
CREATE INDEX "campaigns_beneficiary_id_idx" ON "campaigns"("beneficiary_id");

-- CreateIndex
CREATE INDEX "campaigns_coordinator_id_idx" ON "campaigns"("coordinator_id");

-- CreateIndex
CREATE INDEX "campaigns_organization_id_idx" ON "campaigns"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "milestones_campaign_id_position_key" ON "milestones"("campaign_id", "position");

-- CreateIndex
CREATE INDEX "campaign_updates_campaign_id_published_at_idx" ON "campaign_updates"("campaign_id", "published_at");

-- CreateIndex
CREATE INDEX "campaign_updates_milestone_id_idx" ON "campaign_updates"("milestone_id");

-- CreateIndex
CREATE UNIQUE INDEX "donations_provider_payment_id_key" ON "donations"("provider_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "donations_idempotency_key_key" ON "donations"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "donations_receipt_number_key" ON "donations"("receipt_number");

-- CreateIndex
CREATE INDEX "donations_campaign_id_status_created_at_idx" ON "donations"("campaign_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "donations_donor_user_id_idx" ON "donations"("donor_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_provider_refund_id_key" ON "refunds"("provider_refund_id");

-- CreateIndex
CREATE INDEX "refunds_donation_id_idx" ON "refunds"("donation_id");

-- CreateIndex
CREATE INDEX "payment_webhook_events_processed_at_received_at_idx" ON "payment_webhook_events"("processed_at", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_events_provider_provider_event_id_key" ON "payment_webhook_events"("provider", "provider_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_code_key" ON "ledger_accounts"("code");

-- CreateIndex
CREATE INDEX "ledger_accounts_campaign_id_idx" ON "ledger_accounts"("campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transactions_seq_key" ON "ledger_transactions"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transactions_idempotency_key_key" ON "ledger_transactions"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transactions_hash_key" ON "ledger_transactions"("hash");

-- CreateIndex
CREATE INDEX "ledger_transactions_chain_key_seq_idx" ON "ledger_transactions"("chain_key", "seq");

-- CreateIndex
CREATE INDEX "ledger_transactions_reference_type_reference_id_idx" ON "ledger_transactions"("reference_type", "reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transactions_chain_key_prev_hash_key" ON "ledger_transactions"("chain_key", "prev_hash");

-- CreateIndex
CREATE INDEX "ledger_entries_transaction_id_idx" ON "ledger_entries"("transaction_id");

-- CreateIndex
CREATE INDEX "ledger_entries_account_id_idx" ON "ledger_entries"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_anchors_period_end_key" ON "ledger_anchors"("period_end");

-- CreateIndex
CREATE UNIQUE INDEX "disbursements_idempotency_key_key" ON "disbursements"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "disbursements_provider_payout_id_key" ON "disbursements"("provider_payout_id");

-- CreateIndex
CREATE INDEX "disbursements_campaign_id_status_idx" ON "disbursements"("campaign_id", "status");

-- CreateIndex
CREATE INDEX "disbursements_milestone_id_idx" ON "disbursements"("milestone_id");

-- CreateIndex
CREATE INDEX "disbursement_proofs_disbursement_id_idx" ON "disbursement_proofs"("disbursement_id");

-- CreateIndex
CREATE INDEX "disbursement_proofs_media_asset_id_idx" ON "disbursement_proofs"("media_asset_id");

-- CreateIndex
CREATE INDEX "ai_invocations_feature_created_at_idx" ON "ai_invocations"("feature", "created_at");

-- CreateIndex
CREATE INDEX "ai_invocations_target_type_target_id_idx" ON "ai_invocations"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "outbox_events_published_at_id_idx" ON "outbox_events"("published_at", "id");

-- AddForeignKey
ALTER TABLE "coordinator_profiles" ADD CONSTRAINT "coordinator_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coordinator_profiles" ADD CONSTRAINT "coordinator_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficiary_private" ADD CONSTRAINT "beneficiary_private_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_social_post_id_fkey" FOREIGN KEY ("social_post_id") REFERENCES "social_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_cases" ADD CONSTRAINT "verification_cases_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_cases" ADD CONSTRAINT "verification_cases_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_cases" ADD CONSTRAINT "verification_cases_coordinator_id_fkey" FOREIGN KEY ("coordinator_id") REFERENCES "coordinator_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_evidence" ADD CONSTRAINT "verification_evidence_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "verification_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_evidence" ADD CONSTRAINT "verification_evidence_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_coordinator_id_fkey" FOREIGN KEY ("coordinator_id") REFERENCES "coordinator_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_updates" ADD CONSTRAINT "campaign_updates_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_updates" ADD CONSTRAINT "campaign_updates_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_donor_user_id_fkey" FOREIGN KEY ("donor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_donation_id_fkey" FOREIGN KEY ("donation_id") REFERENCES "donations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursement_proofs" ADD CONSTRAINT "disbursement_proofs_disbursement_id_fkey" FOREIGN KEY ("disbursement_id") REFERENCES "disbursements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursement_proofs" ADD CONSTRAINT "disbursement_proofs_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
