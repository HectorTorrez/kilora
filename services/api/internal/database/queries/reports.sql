-- name: RevokeVehicleReports :exec
UPDATE vehicle_report SET revoked_at = now() WHERE vehicle_id = sqlc.arg(vehicle_id) AND revoked_at IS NULL;

-- name: CreateVehicleReport :one
INSERT INTO vehicle_report (vehicle_id, created_by, token_hash, summary, expires_at) VALUES (sqlc.arg(vehicle_id), sqlc.arg(created_by), sqlc.arg(token_hash), sqlc.narg(summary), sqlc.arg(expires_at)) RETURNING *;

-- name: GetActiveVehicleReport :one
SELECT * FROM vehicle_report WHERE vehicle_id = sqlc.arg(vehicle_id) AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1;

-- name: GetPublicVehicleReport :one
SELECT r.id, r.vehicle_id, r.created_by, r.summary, r.created_at, r.expires_at, v.make, v.model, v.year, v.plate, v.body_type
FROM vehicle_report r JOIN vehicle v ON v.id = r.vehicle_id
WHERE r.token_hash = sqlc.arg(token_hash) AND r.revoked_at IS NULL AND r.expires_at > now() AND v.owner_user_id = r.created_by;

-- name: ListHistoryForReport :many
SELECT * FROM history_record WHERE vehicle_id = sqlc.arg(vehicle_id) ORDER BY performed_on DESC, created_at DESC, id DESC;

-- name: ListCorrectionsForVehicleReport :many
SELECT c.* FROM correction c JOIN history_record h ON h.id = c.history_record_id WHERE h.vehicle_id = sqlc.arg(vehicle_id) ORDER BY c.created_at DESC;

-- name: ListOdometerForReport :many
SELECT km, read_at FROM odometer_reading WHERE vehicle_id = sqlc.arg(vehicle_id) ORDER BY read_at DESC, created_at DESC;
