-- =====================================================================
-- Migration 006: Platform feedback
-- =====================================================================
-- All active roles may submit platform/rescue-experience feedback.
-- Only ADMIN users may read the global feedback queue.
-- Feedback is intentionally separate from rescue-case state changes.
-- =====================================================================

CREATE TABLE IF NOT EXISTS feedback (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(40) NOT NULL DEFAULT 'PLATFORM',
  rating SMALLINT NOT NULL,
  message TEXT,
  case_id INTEGER REFERENCES rescue_cases(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE feedback
  DROP CONSTRAINT IF EXISTS feedback_category_check;

ALTER TABLE feedback
  ADD CONSTRAINT feedback_category_check
  CHECK (
    category IN (
      'PLATFORM',
      'RESCUE_EXPERIENCE',
      'VOLUNTEER_EXPERIENCE',
      'NGO_EXPERIENCE',
      'SUGGESTION',
      'OTHER'
    )
  );

ALTER TABLE feedback
  DROP CONSTRAINT IF EXISTS feedback_rating_check;

ALTER TABLE feedback
  ADD CONSTRAINT feedback_rating_check
  CHECK (rating BETWEEN 1 AND 5);

ALTER TABLE feedback
  DROP CONSTRAINT IF EXISTS feedback_message_length_check;

ALTER TABLE feedback
  ADD CONSTRAINT feedback_message_length_check
  CHECK (message IS NULL OR char_length(btrim(message)) BETWEEN 1 AND 2000);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at
  ON feedback (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_user_created_at
  ON feedback (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_case_id
  ON feedback (case_id);
