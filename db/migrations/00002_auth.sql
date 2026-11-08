-- +goose Up
CREATE TABLE session (
 id text PRIMARY KEY, user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 last_seen_at timestamptz NOT NULL DEFAULT now(), user_agent text, ip text
);
CREATE INDEX session_user_id_idx ON session(user_id);
CREATE INDEX session_expires_at_idx ON session(expires_at);
CREATE TYPE auth_token_purpose AS ENUM ('verify_email', 'reset_password');
CREATE TABLE auth_token (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
 purpose auth_token_purpose NOT NULL, expires_at timestamptz NOT NULL,
 used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
-- +goose Down
DROP TABLE auth_token, session;
DROP TYPE auth_token_purpose;
