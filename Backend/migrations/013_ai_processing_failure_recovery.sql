BEGIN;

ALTER TABLE case_processing_jobs
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_case_processing_jobs_failed
  ON case_processing_jobs (failed_at, created_at)
  WHERE failed_at IS NOT NULL;

COMMIT;
