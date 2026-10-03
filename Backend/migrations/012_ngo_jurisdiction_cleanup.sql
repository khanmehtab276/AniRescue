-- Migration 012: NGO jurisdiction cleanup

-- Jurisdiction is an NGO-only service-area field.
ALTER TABLE users
  ALTER COLUMN jurisdiction_radius_km DROP DEFAULT;

-- Remove jurisdiction values from all non-NGO accounts.
UPDATE users
SET
  jurisdiction_lat = NULL,
  jurisdiction_lng = NULL,
  jurisdiction_radius_km = NULL
WHERE role <> 'NGO';
