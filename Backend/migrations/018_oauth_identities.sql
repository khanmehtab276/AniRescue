-- =====================================================================
-- Migration 018: OAuth identities
-- =====================================================================
-- Keeps external provider identities separate from the AniRescue user
-- record while preserving the existing password/session authentication.
-- =====================================================================

BEGIN;

ALTER TABLE users
  ALTER COLUMN password_hash DROP NOT NULL;

CREATE TABLE IF NOT EXISTS oauth_identities (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL,
  provider_subject VARCHAR(255) NOT NULL,
  provider_email VARCHAR(255),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT oauth_identities_provider_subject_unique
    UNIQUE (provider, provider_subject),
  CONSTRAINT oauth_identities_user_provider_unique
    UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_oauth_identities_user_id
  ON oauth_identities (user_id);

COMMIT;
