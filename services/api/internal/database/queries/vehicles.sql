-- name: CreateVehicle :one
INSERT INTO vehicle (owner_user_id, created_by_workshop_id, status, plate, make, model, year, vin, contact_name, contact_phone) VALUES (sqlc.arg(owner_user_id), sqlc.arg(created_by_workshop_id), sqlc.arg(status), sqlc.arg(plate), sqlc.arg(make), sqlc.arg(model), sqlc.arg(year), sqlc.arg(vin), sqlc.arg(contact_name), sqlc.arg(contact_phone)) RETURNING *;

-- name: GetVehicle :one
SELECT v.* FROM vehicle v JOIN vehicle_link l ON l.vehicle_id = v.id WHERE v.id = sqlc.arg(id) AND l.workshop_id = sqlc.arg(workshop_id);

-- name: ListVehiclesByOwner :many
SELECT * FROM vehicle WHERE owner_user_id = sqlc.arg(owner_user_id) ORDER BY last_activity_at DESC;

-- name: ListVehiclesForWorkshop :many
SELECT v.* FROM vehicle v JOIN vehicle_link l ON l.vehicle_id = v.id WHERE l.workshop_id = sqlc.arg(workshop_id) AND (COALESCE(sqlc.narg(include_archived)::boolean, false) OR v.status <> 'archivado') ORDER BY v.last_activity_at DESC;

-- name: SearchVehiclesForWorkshop :many
SELECT v.* FROM vehicle v JOIN vehicle_link l ON l.vehicle_id = v.id WHERE l.workshop_id = sqlc.arg(workshop_id) AND v.plate LIKE sqlc.arg(plate_prefix)::text || '%' AND v.status <> 'archivado' ORDER BY v.last_activity_at DESC;

-- name: LinkVehicleToWorkshop :exec
INSERT INTO vehicle_link (vehicle_id, workshop_id) VALUES (sqlc.arg(vehicle_id), sqlc.arg(workshop_id)) ON CONFLICT DO NOTHING;

-- name: GetVehicleLink :one
SELECT * FROM vehicle_link WHERE vehicle_id = sqlc.arg(vehicle_id) AND workshop_id = sqlc.arg(workshop_id);

-- name: SetVehicleOwner :execrows
UPDATE vehicle SET owner_user_id = sqlc.arg(owner_user_id), status = 'vinculado' WHERE id = sqlc.arg(vehicle_id) AND EXISTS (SELECT 1 FROM vehicle_link WHERE vehicle_id = vehicle.id AND workshop_id = sqlc.arg(workshop_id));

-- name: TouchVehicleActivity :execrows
UPDATE vehicle SET last_activity_at = now() WHERE id = sqlc.arg(vehicle_id) AND EXISTS (SELECT 1 FROM vehicle_link WHERE vehicle_id = vehicle.id AND workshop_id = sqlc.arg(workshop_id));

-- name: GetVehicleForOwner :one
SELECT * FROM vehicle WHERE id = sqlc.arg(id) AND owner_user_id = sqlc.arg(owner_user_id);
