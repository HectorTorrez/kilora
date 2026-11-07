-- NextWorkOrderNumber debe ejecutarse dentro de la transacción; UNIQUE (workshop_id, number) protege contra duplicados.
-- name: NextWorkOrderNumber :one
SELECT (COALESCE(MAX(number), 0) + 1)::int AS number FROM work_order WHERE workshop_id = sqlc.arg(workshop_id);

-- CreateWorkOrder solo inserta si el vehículo está vinculado al taller; sin vínculo no devuelve filas.
-- name: CreateWorkOrder :one
INSERT INTO work_order (workshop_id, branch_id, vehicle_id, number, reason, odometer_km, internal_notes, created_by)
SELECT sqlc.arg(workshop_id), sqlc.arg(branch_id), sqlc.arg(vehicle_id), sqlc.arg(number), sqlc.arg(reason), sqlc.narg(odometer_km), sqlc.narg(internal_notes), sqlc.arg(created_by)
WHERE EXISTS (SELECT 1 FROM vehicle_link WHERE vehicle_id = sqlc.arg(vehicle_id) AND workshop_id = sqlc.arg(workshop_id))
RETURNING *;

-- name: GetWorkOrder :one
SELECT * FROM work_order WHERE id = sqlc.arg(id) AND workshop_id = sqlc.arg(workshop_id);

-- name: ListWorkOrdersByWorkshop :many
SELECT wo.*, v.plate, v.make, v.model FROM work_order wo JOIN vehicle v ON v.id = wo.vehicle_id WHERE wo.workshop_id = sqlc.arg(workshop_id) AND (sqlc.narg(status)::work_order_status IS NULL OR wo.status = sqlc.narg(status)) AND (sqlc.narg(branch_id)::uuid IS NULL OR wo.branch_id = sqlc.narg(branch_id)) ORDER BY wo.received_at DESC;

-- name: UpdateWorkOrderStatus :execrows
UPDATE work_order SET status = sqlc.arg(status), completed_at = sqlc.narg(completed_at), cancelled_at = sqlc.narg(cancelled_at), cancel_reason = sqlc.narg(cancel_reason) WHERE id = sqlc.arg(id) AND workshop_id = sqlc.arg(workshop_id);
