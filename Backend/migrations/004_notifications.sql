BEGIN;

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,

    user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,

    case_id INTEGER
        REFERENCES rescue_cases(id) ON DELETE CASCADE,

    notification_type VARCHAR(50) NOT NULL,

    title VARCHAR(200) NOT NULL,

    message TEXT NOT NULL,

    is_read BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON notifications (user_id, is_read);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_case_user_type
    ON notifications (user_id, case_id, notification_type);

COMMIT;