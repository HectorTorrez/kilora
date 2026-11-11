-- name: CreateVehicle :one
INSERT INTO vehicle (owner_user_id, created_by_workshop_id, status, plate, make, model, year, vin) VALUES (sqlc.arg(owner_user_id), sqlc.arg(created_by_workshop_id), sqlc.arg(status), sqlc.arg(plate), sqlc.arg(make), sqlc.arg(model), sqlc.arg(year), sqlc.arg(vin)) RETURNING *;

-- name: GetVehicle :one
SELECT v.* FROM vehicle v JOIN vehicle_link l ON l.vehicle_id = v.id WHERE v.id = sqlc.arg(id) AND l.workshop_id = sqlc.arg(workshop_id);

-- name: ListVehiclesByOwner :many
SELECT * FROM vehicle WHERE owner_user_id = sqlc.arg(owner_user_id) ORDER BY last_activity_at DESC;

-- name: ListVehiclesForWorkshop :many
SELECT sqlc.embed(v), c.id AS customer_id, c.full_name AS customer_name, c.phone AS customer_phone
FROM vehicle v
JOIN vehicle_link l ON l.vehicle_id = v.id
LEFT JOIN customer c ON c.id = l.customer_id
WHERE l.workshop_id = sqlc.arg(workshop_id)
  AND (sqlc.arg(include_archived)::boolean OR v.status <> 'archivado')
  AND (sqlc.arg(plate_prefix)::text = '' OR starts_with(v.plate, sqlc.arg(plate_prefix)::text))
ORDER BY v.last_activity_at DESC;

-- name: LinkVehicleToWorkshop :exec
INSERT INTO vehicle_link (vehicle_id, workshop_id) VALUES (sqlc.arg(vehicle_id), sqlc.arg(workshop_id)) ON CONFLICT DO NOTHING;

-- name: TouchVehicleActivity :execrows
UPDATE vehicle SET last_activity_at = now() WHERE id = sqlc.arg(vehicle_id) AND EXISTS (SELECT 1 FROM vehicle_link WHERE vehicle_id = vehicle.id AND workshop_id = sqlc.arg(workshop_id));

-- name: GetVehicleForOwner :one
SELECT * FROM vehicle WHERE id = sqlc.arg(id) AND owner_user_id = sqlc.arg(owner_user_id);

-- name: ListVehiclesPage :many
SELECT sqlc.embed(v), c.id AS customer_id, c.full_name AS customer_name, c.phone AS customer_phone
FROM vehicle v JOIN vehicle_link l ON l.vehicle_id = v.id
LEFT JOIN customer c ON c.id = l.customer_id
WHERE l.workshop_id = sqlc.arg(workshop_id) AND v.status <> 'archivado'
  AND (sqlc.narg(search)::text IS NULL OR regexp_replace(lower(concat_ws(' ', v.plate, v.make, v.model, c.full_name, c.phone, v.vin)), '[[:space:]-]', '', 'g') ILIKE sqlc.narg(search) ESCAPE '\')
  AND (cardinality(sqlc.arg(statuses)::text[]) = 0 OR v.status::text = ANY(sqlc.arg(statuses)::text[]))
  AND (sqlc.narg(date_from)::date IS NULL OR (v.last_activity_at AT TIME ZONE 'America/El_Salvador')::date >= sqlc.narg(date_from)::date)
  AND (sqlc.narg(date_to)::date IS NULL OR (v.last_activity_at AT TIME ZONE 'America/El_Salvador')::date <= sqlc.narg(date_to)::date)
ORDER BY v.last_activity_at DESC, v.id DESC
LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset);

-- name: CountVehiclesByStatus :many
SELECT v.status, count(*) AS total
FROM vehicle v JOIN vehicle_link l ON l.vehicle_id = v.id
LEFT JOIN customer c ON c.id = l.customer_id
WHERE l.workshop_id = sqlc.arg(workshop_id) AND v.status <> 'archivado'
  AND (sqlc.narg(search)::text IS NULL OR regexp_replace(lower(concat_ws(' ', v.plate, v.make, v.model, c.full_name, c.phone, v.vin)), '[[:space:]-]', '', 'g') ILIKE sqlc.narg(search) ESCAPE '\')
  AND (sqlc.narg(date_from)::date IS NULL OR (v.last_activity_at AT TIME ZONE 'America/El_Salvador')::date >= sqlc.narg(date_from)::date)
  AND (sqlc.narg(date_to)::date IS NULL OR (v.last_activity_at AT TIME ZONE 'America/El_Salvador')::date <= sqlc.narg(date_to)::date)
GROUP BY v.status;
