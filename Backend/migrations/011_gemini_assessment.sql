-- Gemini preliminary animal-rescue assessment fields.
-- Gemini is advisory and optional; YOLO remains the validation gatekeeper.

ALTER TABLE rescue_cases
  ADD COLUMN IF NOT EXISTS gemini_status VARCHAR(32) NOT NULL DEFAULT 'NOT_RUN',
  ADD COLUMN IF NOT EXISTS gemini_analysis JSONB,
  ADD COLUMN IF NOT EXISTS gemini_analyzed_at TIMESTAMPTZ;

ALTER TABLE rescue_cases
  DROP CONSTRAINT IF EXISTS rescue_cases_gemini_status_check;

ALTER TABLE rescue_cases
  ADD CONSTRAINT rescue_cases_gemini_status_check
  CHECK (
    gemini_status IN (
      'NOT_RUN',
      'COMPLETED',
      'NOT_CONFIGURED',
      'QUOTA_EXHAUSTED',
      'AUTH_ERROR',
      'TIMEOUT',
      'API_ERROR',
      'NOT_APPLICABLE'
    )
  );

CREATE INDEX IF NOT EXISTS idx_rescue_cases_gemini_status
  ON rescue_cases (gemini_status);
