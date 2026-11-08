-- NextWorkOrderNumber debe ejecutarse dentro de la transacción; UNIQUE (workshop_id, number) protege contra duplicados.
-- name: NextWorkOrderNumber :one
SELECT (COALESCE(MAX(number), 0) + 1)::int AS number FROM work_order WHERE workshop_id = sqlc.arg(workshop_id);

-- name: CreateWorkOrder :one
INSERT INTO work_order (workshop_id, branch_id, vehicle_id, number, reason, odometer_km, internal_notes, created_by)
SELECT sqlc.arg(workshop_id), sqlc.arg(branch_id), sqlc.arg(vehicle_id), sqlc.arg(number), sqlc.arg(reason), sqlc.narg(odometer_km), sqlc.narg(internal_notes), sqlc.arg(created_by)
WHERE EXISTS (SELECT 1 FROM vehicle_link WHERE vehicle_id = sqlc.arg(vehicle_id) AND workshop_id = sqlc.arg(workshop_id))
RETURNING *;

-- name: GetWorkOrder :one
SELECT * FROM work_order WHERE id = sqlc.arg(id) AND workshop_id = sqlc.arg(workshop_id);

-- name: ListWorkOrdersByWorkshop :many
SELECT wo.*, v.plate, v.make, v.model FROM work_order wo JOIN vehicle v ON v.id = wo.vehicle_id WHERE wo.workshop_id = sqlc.arg(workshop_id) AND wo.branch_id = ANY(sqlc.arg(branch_ids)::uuid[]) AND (sqlc.narg(status)::work_order_status IS NULL OR wo.status = sqlc.narg(status)) AND (sqlc.narg(branch_id)::uuid IS NULL OR wo.branch_id = sqlc.narg(branch_id)) ORDER BY wo.received_at DESC;

-- name: TransitionWorkOrderStatus :execrows
UPDATE work_order SET status = sqlc.arg(status), completed_at = sqlc.narg(completed_at), cancelled_at = sqlc.narg(cancelled_at), cancel_reason = sqlc.narg(cancel_reason) WHERE id = sqlc.arg(id) AND workshop_id = sqlc.arg(workshop_id) AND status = sqlc.arg(previous_status);

-- name: LockWorkOrder :one
SELECT * FROM work_order WHERE id = sqlc.arg(id) AND workshop_id = sqlc.arg(workshop_id) FOR UPDATE;

-- name: EditWorkOrder :one
UPDATE work_order SET reason = sqlc.arg(reason), odometer_km = sqlc.narg(odometer_km), public_notes = sqlc.narg(public_notes), internal_notes = sqlc.narg(internal_notes) WHERE id = sqlc.arg(id) AND workshop_id = sqlc.arg(workshop_id) RETURNING *;

-- name: GetHistoryIDByOrder :one
SELECT id FROM history_record WHERE work_order_id = sqlc.arg(work_order_id);

-- name: ListWorkOrdersPage :many
SELECT sqlc.embed(wo), v.plate, v.make, v.model
FROM work_order wo JOIN vehicle v ON v.id = wo.vehicle_id
WHERE wo.workshop_id = sqlc.arg(workshop_id)
  AND wo.branch_id = ANY(sqlc.arg(branch_ids)::uuid[])
  AND (sqlc.narg(branch_id)::uuid IS NULL OR wo.branch_id = sqlc.narg(branch_id))
  AND (sqlc.narg(search)::text IS NULL OR concat_ws(' ', v.plate, wo.reason, v.make, v.model, '#' || wo.number::text) ILIKE sqlc.narg(search) ESCAPE '\')
  AND (sqlc.narg(status)::work_order_status IS NULL OR wo.status = sqlc.narg(status))
ORDER BY wo.received_at DESC, wo.id DESC
LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset);

-- name: CountWorkOrdersByStatus :many
SELECT wo.status, count(*) AS total
FROM work_order wo JOIN vehicle v ON v.id = wo.vehicle_id
WHERE wo.workshop_id = sqlc.arg(workshop_id)
  AND wo.branch_id = ANY(sqlc.arg(branch_ids)::uuid[])
  AND (sqlc.narg(branch_id)::uuid IS NULL OR wo.branch_id = sqlc.narg(branch_id))
  AND (sqlc.narg(search)::text IS NULL OR concat_ws(' ', v.plate, wo.reason, v.make, v.model, '#' || wo.number::text) ILIKE sqlc.narg(search) ESCAPE '\')
GROUP BY wo.status;
