-- =====================================================================
-- Migration 001: AniRescue original database baseline
-- =====================================================================
-- This migration captures the application schema that existed before
-- the numbered feature migrations were introduced.
--
-- The original Neon database was created manually. This file therefore
-- includes every manual-only object that is not introduced by migrations
-- 002-010, including all four PostgreSQL enums and the volunteer location/
-- availability fields.
--
-- Later feature migrations must remain responsible for their own changes.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Original PostgreSQL enum types
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
-- jurisdiction_* is added by migration 002 and is intentionally not
-- duplicated here.
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
-- are added by later migrations.
--
-- priority originally had no default. Migration 002 intentionally
-- establishes STANDARD and backfills existing NULL values.
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
  reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_volunteer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  resolution_image_payload TEXT,
  resolution_notes TEXT,
  verification_status VARCHAR(50) DEFAULT 'Unverified'
);

-- ---------------------------------------------------------------------
-- Original rescue-case indexes
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
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
