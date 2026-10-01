-- =====================================================================
-- Migration 001: AniRescue original database baseline
-- =====================================================================
-- This migration captures the schema that existed in Neon BEFORE the
-- numbered application migrations were introduced.
--
-- IMPORTANT:
--   - This is the true starting point for a fresh database.
--   - Later feature migrations must add their own objects here only if
--     those objects existed before migration tracking began.
--   - Do not add objects from migrations 002+ to this file.
--
-- Reconstructed from the current Neon schema plus the original migration
-- history. In particular, the original database used PostgreSQL enums
-- for role/account/case/volunteer availability and already had the
-- rescue-case indexes defined below.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Original enum types
-- ---------------------------------------------------------------------

CREATE TYPE user_role AS ENUM (
  'USER',
  'VOLUNTEER',
  'NGO',
  'ADMIN'
);

CREATE TYPE account_status AS ENUM (
  'PENDING',
  'ACTIVE',
  'REJECTED',
  'SUSPENDED'
);

CREATE TYPE volunteer_availability AS ENUM (
  'OFFLINE',
  'AVAILABLE',
  'ON_RESCUE'
);

CREATE TYPE case_status AS ENUM (
  'PENDING_VALIDATION',
  'PROCESSING_ANALYSIS',
  'VALIDATION_PASSED',
  'REJECTED_JUNK',
  'IN_PROGRESS',
  'RESOLVED',
  'CANCELLED',
  'RESCUE_COMPLETED'
);

-- ---------------------------------------------------------------------
-- Original users table
--
-- jurisdiction_* were introduced by migration 002 and are therefore
-- intentionally NOT part of this baseline.
-- ---------------------------------------------------------------------

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'USER',
  latitude NUMERIC(10,8),
  longitude NUMERIC(11,8),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  account_status account_status NOT NULL DEFAULT 'ACTIVE',
  availability_status volunteer_availability NOT NULL DEFAULT 'OFFLINE',
  location_updated_at TIMESTAMPTZ
);

-- ---------------------------------------------------------------------
-- Original rescue_cases table
--
-- Evidence/verification fields, AI audit fields and client_request_id
-- are intentionally added by later migrations.
--
-- priority originally existed without the later STANDARD default;
-- migration 002 establishes that default and backfills existing NULLs.
-- ---------------------------------------------------------------------

CREATE TABLE rescue_cases (
  id SERIAL PRIMARY KEY,
  species VARCHAR(100),
  issue_description TEXT NOT NULL,
  priority VARCHAR(50),
  status case_status NOT NULL DEFAULT 'PENDING_VALIDATION',
  latitude NUMERIC(10,8),
  longitude NUMERIC(11,8),
  manual_address TEXT,
  is_custom_location BOOLEAN DEFAULT FALSE,
  image_payload TEXT NOT NULL,
  reporter_id INTEGER
    REFERENCES users(id) ON DELETE SET NULL,
  assigned_volunteer_id INTEGER
    REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  resolution_image_payload TEXT,
  resolution_notes TEXT,
  verification_status VARCHAR(50) DEFAULT 'Unverified'
);

-- ---------------------------------------------------------------------
-- Original indexes from the manually-created Neon schema
-- ---------------------------------------------------------------------

CREATE INDEX idx_cases_reporter
  ON rescue_cases (reporter_id);

CREATE INDEX idx_cases_assigned_volunteer
  ON rescue_cases (assigned_volunteer_id);

CREATE INDEX idx_cases_status
  ON rescue_cases (status);

CREATE UNIQUE INDEX idx_one_active_rescue_per_volunteer
  ON rescue_cases (assigned_volunteer_id)
  WHERE status = 'IN_PROGRESS' AND assigned_volunteer_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- Migration metadata
--
-- The migration runner also bootstraps this table before migration 001
-- so that it can safely record migration 001 on an empty database.
-- IF NOT EXISTS keeps this migration compatible with that runner.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
