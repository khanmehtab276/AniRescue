-- 003_ngo_volunteers.sql
-- NGO ↔ Volunteer many-to-many relationship

CREATE TABLE IF NOT EXISTS ngo_volunteers (
  ngo_id INTEGER NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,

  volunteer_id INTEGER NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (ngo_id, volunteer_id)
);

CREATE INDEX IF NOT EXISTS idx_ngo_volunteers_volunteer_id
  ON ngo_volunteers(volunteer_id);