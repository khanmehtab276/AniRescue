-- =====================================================================
-- Migration 001: Phase 2 — RBAC correctness, evidence/verification flow,
-- NGO jurisdiction, case history/audit trail, priority honesty fix.
--
-- This is the FIRST migration file in the repo. No prior schema was
-- version-controlled, so this only ADDS columns/tables — nothing here
-- drops or renames existing data. Safe to run against the existing
-- Neon database. Run manually via psql or your preferred migration
-- runner; the backend does not auto-apply this on boot.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. New case status: RESCUE_COMPLETED
--    (Postgres has no native enum here — status is a plain VARCHAR/TEXT
--    column per the existing schema — so no ALTER TYPE is needed. The
--    application layer is the source of truth for valid values; see
--    Backend/src/utils/statusTransitions.js)
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 2. Rescue evidence + verification fields on rescue_cases
-- ---------------------------------------------------------------------
ALTER TABLE rescue_cases
  ADD COLUMN IF NOT EXISTS evidence_image_payload TEXT,
  ADD COLUMN IF NOT EXISTS evidence_notes TEXT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- ---------------------------------------------------------------------
-- 3. Priority honesty fix
--    Nothing in the backend or AI worker has ever written to this
--    column — every "HIGH priority" badge in the UI has been rendering
--    off a NULL value. Give it a real, explicit default so it stops
--    silently lying, and backfill existing rows.
-- ---------------------------------------------------------------------
ALTER TABLE rescue_cases
  ALTER COLUMN priority SET DEFAULT 'STANDARD';

UPDATE rescue_cases
   SET priority = 'STANDARD'
 WHERE priority IS NULL;

-- ---------------------------------------------------------------------
-- 4. NGO operating jurisdiction
--    Used to filter the NGO dashboard feed by service radius instead
--    of returning the master case list to every NGO account.
-- ---------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS jurisdiction_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS jurisdiction_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS jurisdiction_radius_km DOUBLE PRECISION DEFAULT 15;

-- ---------------------------------------------------------------------
-- 5. Case status/action history — minimal audit trail
--    Every mutating case action (claim, status change, evidence
--    submission, verification, priority change) inserts one row here.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS case_status_history (
  id            SERIAL PRIMARY KEY,
  case_id       INTEGER NOT NULL REFERENCES rescue_cases(id) ON DELETE CASCADE,
  actor_id      INTEGER REFERENCES users(id),
  actor_role    VARCHAR(20),
  action        VARCHAR(40) NOT NULL,
  from_status   VARCHAR(30),
  to_status     VARCHAR(30),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_status_history_case_id
  ON case_status_history (case_id);
