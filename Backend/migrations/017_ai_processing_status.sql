-- =====================================================================
-- Migration 017: AI processing failure status
-- =====================================================================
-- Migration 013 added durable AI job failure metadata, but the historical
-- case_status enum did not yet contain the corresponding terminal status.
-- Keep the enum change separate so already-applied migration 013 remains
-- immutable and existing databases can safely advance to this migration.
-- =====================================================================

BEGIN;

ALTER TYPE case_status
  ADD VALUE IF NOT EXISTS 'AI_PROCESSING_FAILED';

COMMIT;
