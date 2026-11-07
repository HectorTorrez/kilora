-- name: CreateHistoryRecord :one
INSERT INTO history_record (vehicle_id, workshop_id, work_order_id, source, performed_on, odometer_km, summary, items, total, currency, workshop_notes, internal_cost, internal_notes, created_by) VALUES (sqlc.arg(vehicle_id), sqlc.arg(workshop_id), sqlc.arg(work_order_id), sqlc.arg(source), sqlc.arg(performed_on), sqlc.arg(odometer_km), sqlc.arg(summary), sqlc.arg(items), sqlc.arg(total), sqlc.arg(currency), sqlc.arg(workshop_notes), sqlc.arg(internal_cost), sqlc.arg(internal_notes), sqlc.arg(created_by)) RETURNING *;

-- name: GetHistoryRecord :one
SELECT h.* FROM history_record h JOIN vehicle_link l ON l.vehicle_id = h.vehicle_id WHERE h.id = sqlc.arg(id) AND l.workshop_id = sqlc.arg(workshop_id);

-- name: ListHistoryByVehicle :many
SELECT h.* FROM history_record h JOIN vehicle_link l ON l.vehicle_id = h.vehicle_id WHERE h.vehicle_id = sqlc.arg(vehicle_id) AND l.workshop_id = sqlc.arg(workshop_id) ORDER BY h.performed_on DESC, h.created_at DESC;

-- name: CreateCorrection :one
INSERT INTO correction (history_record_id, reason, changes, created_by) VALUES (sqlc.arg(history_record_id), sqlc.arg(reason), sqlc.arg(changes), sqlc.arg(created_by)) RETURNING *;

-- name: ListCorrectionsByVehicle :many
SELECT c.* FROM correction c JOIN history_record h ON h.id = c.history_record_id JOIN vehicle_link l ON l.vehicle_id = h.vehicle_id WHERE h.vehicle_id = sqlc.arg(vehicle_id) AND l.workshop_id = sqlc.arg(workshop_id) ORDER BY c.created_at DESC;

-- name: ListHistoryForOwner :many
SELECT h.* FROM history_record h JOIN vehicle v ON v.id = h.vehicle_id WHERE h.vehicle_id = sqlc.arg(vehicle_id) AND v.owner_user_id = sqlc.arg(owner_user_id) ORDER BY h.performed_on DESC, h.created_at DESC;

-- name: ListCorrectionsForOwner :many
SELECT c.* FROM correction c JOIN history_record h ON h.id = c.history_record_id JOIN vehicle v ON v.id = h.vehicle_id WHERE h.vehicle_id = sqlc.arg(vehicle_id) AND v.owner_user_id = sqlc.arg(owner_user_id) ORDER BY c.created_at DESC;
