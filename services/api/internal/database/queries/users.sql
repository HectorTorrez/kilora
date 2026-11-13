-- name: CreateUser :one
INSERT INTO app_user (email, password_hash, full_name, phone, maintenance_emails_enabled) VALUES (sqlc.arg(email)::text, sqlc.arg(password_hash), sqlc.arg(full_name), sqlc.arg(phone), lower(btrim(sqlc.arg(email)::text)) NOT LIKE '%@demo.kilora.app') RETURNING *;

-- name: GetUserByID :one
SELECT * FROM app_user WHERE id = sqlc.arg(id);

-- name: GetUserByEmail :one
SELECT * FROM app_user WHERE email = sqlc.arg(email);

-- name: MarkUserEmailVerified :execrows
UPDATE app_user SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = sqlc.arg(id);

-- name: UpdateUserPassword :execrows
UPDATE app_user SET password_hash = sqlc.arg(password_hash) WHERE id = sqlc.arg(id);

-- name: LockAccount :one
SELECT * FROM app_user WHERE id = $1 FOR UPDATE;

-- name: UpdateUserProfile :exec
UPDATE app_user SET full_name = $2, phone = $3 WHERE id = $1;

-- name: AnonymizeUser :exec
UPDATE app_user SET full_name = 'Cuenta eliminada', phone = NULL,
 email = id::text || '@deleted.kilora.invalid', password_hash = '', email_verified_at = NULL WHERE id = $1;

-- name: UnlinkOwnerVehicles :exec
UPDATE vehicle SET owner_user_id = NULL, status = CASE WHEN status = 'vinculado' THEN 'provisional'::vehicle_status ELSE status END WHERE owner_user_id = $1;

-- name: DeleteUserAuthTokens :exec
DELETE FROM auth_token WHERE user_id = $1;

-- name: SetMaintenanceEmailPreference :exec
UPDATE app_user SET maintenance_emails_enabled = $2 WHERE id = $1;
