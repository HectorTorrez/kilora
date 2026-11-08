-- name: CreateUser :one
INSERT INTO app_user (email, password_hash, full_name, phone) VALUES (sqlc.arg(email), sqlc.arg(password_hash), sqlc.arg(full_name), sqlc.arg(phone)) RETURNING *;

-- name: GetUserByID :one
SELECT * FROM app_user WHERE id = sqlc.arg(id);

-- name: GetUserByEmail :one
SELECT * FROM app_user WHERE email = sqlc.arg(email);

-- name: MarkUserEmailVerified :execrows
UPDATE app_user SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = sqlc.arg(id);

-- name: UpdateUserPassword :execrows
UPDATE app_user SET password_hash = sqlc.arg(password_hash) WHERE id = sqlc.arg(id);
