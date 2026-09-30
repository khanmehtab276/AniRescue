BEGIN;

CREATE TABLE IF NOT EXISTS case_processing_jobs (
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

CREATE INDEX IF NOT EXISTS idx_case_processing_jobs_pending
  ON case_processing_jobs (published_at, locked_at, created_at);

COMMIT;
