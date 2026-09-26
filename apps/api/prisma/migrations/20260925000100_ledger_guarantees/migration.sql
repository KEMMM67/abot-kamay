-- 20260925000100_ledger_guarantees/migration.sql
--
-- Guarantees that Prisma's schema language cannot express. They protect money and trust even if
-- application code has a bug. Do NOT remove them, and review every future generated migration to
-- make sure it does not drop the indexes created here.
--
--   1. Ledger and audit tables are append-only (UPDATE, DELETE and TRUNCATE are rejected).
--   2. Every ledger transaction balances (debits = credits), uses one currency matching its
--      accounts, and has at least two entries: checked at COMMIT by a deferred constraint trigger.
--   3. Four-eyes (verification) and maker-checker (disbursements) enforced by CHECK constraints.
--   4. Money columns are positive; currencies are ISO 4217 codes; hashes are sha256 hex.
--   5. One open campaign per beneficiary (partial unique index): blocks duplicate fundraisers.
--   6. pgvector HNSW indexes for duplicate/near-duplicate detection.

-- ---------------------------------------------------------------------------------------------
-- 1. Append-only ledger and audit log
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION abotkamay_forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AbotKamay: % is append-only (% rejected). Post a compensating entry instead.',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER ledger_transactions_append_only
  BEFORE UPDATE OR DELETE ON "ledger_transactions"
  FOR EACH ROW EXECUTE FUNCTION abotkamay_forbid_mutation();
CREATE TRIGGER ledger_transactions_no_truncate
  BEFORE TRUNCATE ON "ledger_transactions"
  FOR EACH STATEMENT EXECUTE FUNCTION abotkamay_forbid_mutation();

CREATE TRIGGER ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION abotkamay_forbid_mutation();
CREATE TRIGGER ledger_entries_no_truncate
  BEFORE TRUNCATE ON "ledger_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION abotkamay_forbid_mutation();

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION abotkamay_forbid_mutation();
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION abotkamay_forbid_mutation();

-- ---------------------------------------------------------------------------------------------
-- 2. Balanced double-entry, verified when the transaction commits
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION abotkamay_assert_ledger_txn_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_imbalance        NUMERIC;
  v_entry_count      INTEGER;
  v_currency_count   INTEGER;
  v_currency_mismatch INTEGER;
BEGIN
  SELECT COALESCE(SUM(CASE WHEN e.direction = 'DEBIT' THEN e.amount_minor ELSE -e.amount_minor END), 0),
         COUNT(*),
         COUNT(DISTINCT e.currency)
    INTO v_imbalance, v_entry_count, v_currency_count
    FROM "ledger_entries" e
   WHERE e.transaction_id = NEW.transaction_id;

  SELECT COUNT(*)
    INTO v_currency_mismatch
    FROM "ledger_entries" e
    JOIN "ledger_accounts" a ON a.id = e.account_id
   WHERE e.transaction_id = NEW.transaction_id
     AND e.currency <> a.currency;

  IF v_imbalance <> 0 OR v_entry_count < 2 OR v_currency_count <> 1 OR v_currency_mismatch > 0 THEN
    RAISE EXCEPTION 'AbotKamay: ledger transaction % is invalid (imbalance=%, entries=%, currencies=%, account_currency_mismatches=%)',
      NEW.transaction_id, v_imbalance, v_entry_count, v_currency_count, v_currency_mismatch
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ledger_transaction_must_balance
  AFTER INSERT ON "ledger_entries"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION abotkamay_assert_ledger_txn_balanced();

ALTER TABLE "ledger_entries"
  ADD CONSTRAINT ledger_entries_amount_positive CHECK (amount_minor > 0),
  ADD CONSTRAINT ledger_entries_currency_iso CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE "ledger_accounts"
  ADD CONSTRAINT ledger_accounts_currency_iso CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE "ledger_transactions"
  ADD CONSTRAINT ledger_transactions_hash_format CHECK (hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT ledger_transactions_prev_hash_format CHECK (prev_hash = 'GENESIS' OR prev_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT ledger_transactions_no_self_link CHECK (prev_hash <> hash);

-- ---------------------------------------------------------------------------------------------
-- 3. Four-eyes and maker-checker
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "verification_cases"
  ADD CONSTRAINT verification_cases_four_eyes
  CHECK (second_reviewer_id IS NULL OR first_reviewer_id IS NULL OR second_reviewer_id <> first_reviewer_id);

ALTER TABLE "disbursements"
  ADD CONSTRAINT disbursements_maker_checker CHECK (
    (approver1_id IS NULL OR approver1_id <> requested_by_id)
    AND (approver2_id IS NULL OR (approver2_id <> requested_by_id
                                  AND (approver1_id IS NULL OR approver2_id <> approver1_id)))
  ),
  ADD CONSTRAINT disbursements_amount_positive CHECK (amount_minor > 0),
  ADD CONSTRAINT disbursements_currency_iso CHECK (currency ~ '^[A-Z]{3}$');

-- ---------------------------------------------------------------------------------------------
-- 4. Money, currency and input sanity checks
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "users"
  ADD CONSTRAINT users_email_lowercase CHECK (email IS NULL OR email = lower(email)),
  ADD CONSTRAINT users_phone_e164 CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{6,14}$');

ALTER TABLE "donations"
  ADD CONSTRAINT donations_amount_positive CHECK (amount_minor > 0),
  ADD CONSTRAINT donations_tip_non_negative CHECK (tip_minor >= 0),
  ADD CONSTRAINT donations_fee_non_negative CHECK (processor_fee_minor IS NULL OR processor_fee_minor >= 0),
  ADD CONSTRAINT donations_currency_iso CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE "refunds"
  ADD CONSTRAINT refunds_amount_positive CHECK (amount_minor > 0);

ALTER TABLE "campaigns"
  ADD CONSTRAINT campaigns_goal_positive CHECK (goal_minor > 0),
  ADD CONSTRAINT campaigns_raised_non_negative CHECK (raised_minor >= 0),
  ADD CONSTRAINT campaigns_currency_iso CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE "milestones"
  ADD CONSTRAINT milestones_budget_positive CHECK (budget_minor > 0),
  ADD CONSTRAINT milestones_position_positive CHECK (position >= 1),
  ADD CONSTRAINT milestones_proof_due_days_range CHECK (proof_due_days BETWEEN 1 AND 60);

ALTER TABLE "submissions"
  ADD CONSTRAINT submissions_urgency_range CHECK (urgency BETWEEN 0 AND 3);

-- ---------------------------------------------------------------------------------------------
-- 5. One open campaign per beneficiary
-- ---------------------------------------------------------------------------------------------
CREATE UNIQUE INDEX campaigns_one_open_per_beneficiary
  ON "campaigns" (beneficiary_id)
  WHERE status IN ('PENDING_REVIEW', 'ACTIVE', 'PAUSED', 'FUNDED', 'UNDER_INVESTIGATION');

-- ---------------------------------------------------------------------------------------------
-- 6. Vector similarity indexes (cosine distance) for duplicate detection
-- ---------------------------------------------------------------------------------------------
-- Partial on purpose: Prisma has no HNSW index type, and a plain HNSW index on these columns is
-- reported as drift (the next `migrate dev` would generate DROP INDEX). Prisma ignores partial
-- indexes when diffing, so these survive. Similarity queries must include
-- `WHERE embedding IS NOT NULL` to use them (they always should anyway).
CREATE INDEX social_posts_embedding_hnsw ON "social_posts" USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;
CREATE INDEX media_assets_embedding_hnsw ON "media_assets" USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;
