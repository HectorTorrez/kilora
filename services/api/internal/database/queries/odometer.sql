-- name: CreateOdometerReading :one
INSERT INTO odometer_reading (vehicle_id, km, read_at, source, work_order_id, recorded_by) VALUES (sqlc.arg(vehicle_id), sqlc.arg(km), sqlc.arg(read_at), sqlc.arg(source), sqlc.arg(work_order_id), sqlc.arg(recorded_by)) RETURNING *;

-- name: GetLatestOdometerReading :one
SELECT o.* FROM odometer_reading o JOIN vehicle_link l ON l.vehicle_id = o.vehicle_id WHERE o.vehicle_id = sqlc.arg(vehicle_id) AND l.workshop_id = sqlc.arg(workshop_id) ORDER BY o.read_at DESC, o.created_at DESC LIMIT 1;

-- name: ListOdometerReadingsForOwner :many
SELECT o.* FROM odometer_reading o JOIN vehicle v ON v.id = o.vehicle_id WHERE o.vehicle_id = sqlc.arg(vehicle_id) AND v.owner_user_id = sqlc.arg(owner_user_id) ORDER BY o.read_at DESC, o.created_at DESC;

-- name: ListLatestOdometerForWorkshop :many
SELECT DISTINCT ON (o.vehicle_id) o.vehicle_id, o.km
FROM odometer_reading o
JOIN vehicle_link l ON l.vehicle_id = o.vehicle_id
WHERE l.workshop_id = sqlc.arg(workshop_id)
ORDER BY o.vehicle_id, o.read_at DESC, o.created_at DESC;
