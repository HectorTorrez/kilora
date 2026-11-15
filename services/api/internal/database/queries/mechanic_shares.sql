-- name: RevokeMechanicShares :exec
UPDATE vehicle_mechanic_share SET revoked_at = now() WHERE vehicle_id = $1 AND revoked_at IS NULL;

-- name: CreateMechanicShare :one
INSERT INTO vehicle_mechanic_share (vehicle_id, created_by, token_hash, record_ids, include_maintenance, expires_at)
VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;

-- name: GetActiveMechanicShare :one
SELECT * FROM vehicle_mechanic_share WHERE vehicle_id = $1 AND revoked_at IS NULL AND expires_at > now();

-- name: GetPublicMechanicShare :one
SELECT s.*, v.make, v.model, v.year, v.plate
FROM vehicle_mechanic_share s JOIN vehicle v ON v.id = s.vehicle_id
WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND v.owner_user_id = s.created_by;

-- name: ListMechanicShareHistory :many
SELECT * FROM history_record WHERE vehicle_id = sqlc.arg(vehicle_id) AND id = ANY(sqlc.arg(record_ids)::uuid[])
ORDER BY performed_on DESC, created_at DESC, id DESC;
