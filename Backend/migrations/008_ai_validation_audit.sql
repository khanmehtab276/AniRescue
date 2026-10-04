BEGIN;

ALTER TABLE rescue_cases
  ADD COLUMN IF NOT EXISTS ai_confidence DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS ai_validated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_rescue_cases_ai_validated
  ON rescue_cases (ai_validated_at);

COMMIT;
