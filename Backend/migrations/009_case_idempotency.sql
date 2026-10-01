BEGIN;

ALTER TABLE rescue_cases
  ADD COLUMN IF NOT EXISTS client_request_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rescue_cases_reporter_request
  ON rescue_cases (reporter_id, client_request_id)
;

COMMIT;
