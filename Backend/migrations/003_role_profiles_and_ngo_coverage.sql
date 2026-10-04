BEGIN;

CREATE TABLE IF NOT EXISTS ngo_profiles (
    user_id INTEGER PRIMARY KEY
        REFERENCES users(id) ON DELETE CASCADE,

    organization_name VARCHAR(150) NOT NULL,
    contact_person VARCHAR(150) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    address TEXT NOT NULL,

    latitude NUMERIC(9, 6) NOT NULL,
    longitude NUMERIC(9, 6) NOT NULL,

    maximum_coverage_radius_km NUMERIC(6, 2) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ngo_profiles_max_radius_positive
        CHECK (maximum_coverage_radius_km > 0),

    CONSTRAINT ngo_profiles_latitude_valid
        CHECK (latitude >= -90 AND latitude <= 90),

    CONSTRAINT ngo_profiles_longitude_valid
        CHECK (longitude >= -180 AND longitude <= 180)
);

CREATE INDEX IF NOT EXISTS idx_ngo_profiles_location
    ON ngo_profiles (latitude, longitude);


CREATE TABLE IF NOT EXISTS volunteer_profiles (
    user_id INTEGER PRIMARY KEY
        REFERENCES users(id) ON DELETE CASCADE,

    phone VARCHAR(30) NOT NULL,
    address TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMIT;