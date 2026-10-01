-- =====================================================================
-- Migration 001: AniRescue initial production schema
-- =====================================================================
-- This is the first version-controlled schema for AniRescue.
--
-- The original database was created manually before migrations were
-- introduced. This file captures the known-good application schema so a
-- fresh PostgreSQL/Neon database can be created without relying on that
-- undocumented manual setup.
--
-- This is a schema baseline only. It does not copy application data.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Enum types
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
-- Core users
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
  jurisdiction_lat DOUBLE PRECISION,
  jurisdiction_lng DOUBLE PRECISION,
  jurisdiction_radius_km DOUBLE PRECISION DEFAULT 15,
  availability_status volunteer_availability NOT NULL DEFAULT 'OFFLINE',
  location_updated_at TIMESTAMPTZ
);

-- ---------------------------------------------------------------------
-- Rescue cases
-- ---------------------------------------------------------------------

CREATE TABLE rescue_cases (
  id SERIAL PRIMARY KEY,
  species VARCHAR(100),
  issue_description TEXT NOT NULL,
  priority VARCHAR(50) DEFAULT 'STANDARD',
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
  verification_status VARCHAR(50) DEFAULT 'Unverified',
  evidence_image_payload TEXT,
  evidence_notes TEXT,
  completed_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  verified_by INTEGER REFERENCES users(id),
  rejection_reason TEXT,
  ai_confidence DOUBLE PRECISION,
  ai_validated_at TIMESTAMPTZ,
  client_request_id UUID
);

CREATE INDEX idx_cases_reporter
  ON rescue_cases (reporter_id);

CREATE INDEX idx_cases_assigned_volunteer
  ON rescue_cases (assigned_volunteer_id);

CREATE INDEX idx_cases_status
  ON rescue_cases (status);

CREATE UNIQUE INDEX idx_one_active_rescue_per_volunteer
  ON rescue_cases (assigned_volunteer_id)
  WHERE status = 'IN_PROGRESS' AND assigned_volunteer_id IS NOT NULL;

CREATE INDEX idx_rescue_cases_ai_validated
  ON rescue_cases (ai_validated_at);

CREATE UNIQUE INDEX idx_rescue_cases_reporter_request
  ON rescue_cases (reporter_id, client_request_id);

-- ---------------------------------------------------------------------
-- Case history / audit
-- ---------------------------------------------------------------------

CREATE TABLE case_status_history (
  id SERIAL PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES rescue_cases(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id),
  actor_role VARCHAR(20),
  action VARCHAR(40) NOT NULL,
  from_status VARCHAR(30),
  to_status VARCHAR(30),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_case_status_history_case_id
  ON case_status_history (case_id);

-- ---------------------------------------------------------------------
-- NGO / volunteer profiles
-- ---------------------------------------------------------------------

CREATE TABLE ngo_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  organization_name VARCHAR(150) NOT NULL,
  contact_person VARCHAR(150) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  address TEXT NOT NULL,
  latitude NUMERIC(9,6) NOT NULL,
  longitude NUMERIC(9,6) NOT NULL,
  maximum_coverage_radius_km NUMERIC(6,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT ngo_profiles_max_radius_positive
    CHECK (maximum_coverage_radius_km > 0),
  CONSTRAINT ngo_profiles_latitude_valid
    CHECK (latitude >= -90 AND latitude <= 90),
  CONSTRAINT ngo_profiles_longitude_valid
    CHECK (longitude >= -180 AND longitude <= 180)
);

CREATE INDEX idx_ngo_profiles_location
  ON ngo_profiles (latitude, longitude);

CREATE TABLE volunteer_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone VARCHAR(30) NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ngo_volunteers (
  ngo_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  volunteer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ngo_id, volunteer_id)
);

CREATE INDEX idx_ngo_volunteers_volunteer_id
  ON ngo_volunteers (volunteer_id);

-- ---------------------------------------------------------------------
-- Notifications / mobile device tokens
-- ---------------------------------------------------------------------

CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id INTEGER REFERENCES rescue_cases(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

CREATE INDEX idx_notifications_user_unread
  ON notifications (user_id, is_read);

CREATE UNIQUE INDEX idx_notifications_case_user_type
  ON notifications (user_id, case_id, notification_type);

CREATE TABLE device_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform VARCHAR(20),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_device_tokens_token UNIQUE (token)
);

CREATE INDEX idx_device_tokens_user_active
  ON device_tokens (user_id, is_active);

-- ---------------------------------------------------------------------
-- Async AI processing outbox
-- ---------------------------------------------------------------------

CREATE TABLE case_processing_jobs (
  id BIGSERIAL PRIMARY KEY,
  case_id INTEGER NOT NULL UNIQUE
    REFERENCES rescue_cases(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  locked_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_case_processing_jobs_pending
  ON case_processing_jobs (published_at, locked_at, created_at);

-- ---------------------------------------------------------------------
-- Migration metadata
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
