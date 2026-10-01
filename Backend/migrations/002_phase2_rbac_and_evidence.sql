-- =====================================================================
-- Migration 002: Phase 2 — RBAC correctness, evidence/verification flow,
-- NGO jurisdiction, volunteer availability, case history/audit trail,
-- and priority default/backfill.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Rescue evidence + verification fields
-- ---------------------------------------------------------------------
ALTER TABLE rescue_cases
  ADD COLUMN IF NOT EXISTS evidence_image_payload TEXT,
  ADD COLUMN IF NOT EXISTS evidence_notes TEXT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- ---------------------------------------------------------------------
-- 2. Priority honesty fix
-- ---------------------------------------------------------------------
ALTER TABLE rescue_cases
  ALTER COLUMN priority SET DEFAULT 'STANDARD';

UPDATE rescue_cases
   SET priority = 'STANDARD'
 WHERE priority IS NULL;

-- ---------------------------------------------------------------------
-- 3. NGO operating jurisdiction
-- ---------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS jurisdiction_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS jurisdiction_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS jurisdiction_radius_km DOUBLE PRECISION DEFAULT 15;

-- ---------------------------------------------------------------------
-- 4. Volunteer availability/location tracking
--
-- These fields existed in the manually-created Neon schema but were
-- missing from the original migration history. They are represented
-- here so a fresh database reproduces the current schema exactly.
-- ---------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS availability_status volunteer_availability
    NOT NULL DEFAULT 'OFFLINE',
  ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------
-- 5. Case status/action history
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
