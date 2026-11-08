-- name: CreateSession :exec
INSERT INTO session (id, user_id, expires_at, user_agent, ip) VALUES ($1, $2, $3, $4, $5);
-- name: GetSession :one
SELECT * FROM session WHERE id = $1 AND expires_at > now();
-- name: TouchSession :execrows
UPDATE session SET last_seen_at = now(), expires_at = now() + interval '30 days' WHERE id = $1 AND expires_at > now() AND last_seen_at <= now() - interval '1 hour';
-- name: DeleteSession :exec
DELETE FROM session WHERE id = $1;
-- name: DeleteUserSessions :exec
DELETE FROM session WHERE user_id = $1;
