-- name: CreateRecommendation :one
INSERT INTO recommendation (vehicle_id, workshop_id, work_order_id, description, category, due_date, due_km, created_by)
VALUES (sqlc.arg(vehicle_id), sqlc.arg(workshop_id), sqlc.narg(work_order_id), sqlc.arg(description), sqlc.narg(category), sqlc.narg(due_date), sqlc.narg(due_km), sqlc.arg(created_by))
RETURNING *;

-- name: ListRecommendationsByVehicle :many
SELECT * FROM recommendation WHERE vehicle_id = sqlc.arg(vehicle_id) AND workshop_id = sqlc.arg(workshop_id)
ORDER BY (status = 'pendiente') DESC, due_date NULLS LAST, created_at DESC;

-- name: ListRecommendationsForWorkshop :many
SELECT r.*, v.plate, v.make, v.model
FROM recommendation r JOIN vehicle v ON v.id = r.vehicle_id
WHERE r.workshop_id = sqlc.arg(workshop_id) AND (sqlc.narg(status)::recommendation_status IS NULL OR r.status = sqlc.narg(status)::recommendation_status)
ORDER BY r.due_date NULLS LAST, r.created_at DESC
LIMIT 200;

-- name: ResolveRecommendation :one
UPDATE recommendation SET status = sqlc.arg(status), resolved_at = now(), resolved_by = sqlc.arg(resolved_by)
WHERE id = sqlc.arg(id) AND workshop_id = sqlc.arg(workshop_id) AND status = 'pendiente'
RETURNING *;
