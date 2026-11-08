-- name: CreateAuthToken :exec
INSERT INTO auth_token (token_hash, user_id, purpose, expires_at) VALUES ($1, $2, $3, $4);
-- name: ConsumeAuthToken :one
UPDATE auth_token SET used_at = now() WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now() RETURNING user_id;
