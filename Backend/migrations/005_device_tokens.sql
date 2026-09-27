BEGIN;

CREATE TABLE IF NOT EXISTS device_tokens (
    id SERIAL PRIMARY KEY,

    user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,

    token TEXT NOT NULL,

    platform VARCHAR(20),

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_device_tokens_token UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user_active
    ON device_tokens (user_id, is_active);

COMMIT;