-- Migration 014: distinguish terminal AI processing failure from junk rejection.
-- A model/infrastructure failure must never be presented as a failed animal report.
ALTER TYPE case_status
  ADD VALUE IF NOT EXISTS 'AI_PROCESSING_FAILED';
