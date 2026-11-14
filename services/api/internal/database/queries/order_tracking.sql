-- name: UpdateWorkOrderTracking :exec
UPDATE work_order SET customer_update = sqlc.narg(customer_update), estimated_ready_at = sqlc.narg(estimated_ready_at), tracking_updated_at = now()
WHERE id = sqlc.arg(id) AND workshop_id = sqlc.arg(workshop_id);

-- name: GetActiveWorkOrderTrackingShare :one
SELECT shared_at, expires_at FROM work_order_tracking_share WHERE work_order_id = $1 AND expires_at > now();

-- name: ShareWorkOrderTracking :one
INSERT INTO work_order_tracking_share (work_order_id, token_hash, expires_at, created_by)
VALUES ($1, $2, $3, $4)
ON CONFLICT (work_order_id) DO UPDATE SET token_hash = excluded.token_hash, shared_at = now(), expires_at = excluded.expires_at, created_by = excluded.created_by
RETURNING shared_at, expires_at;

-- name: RevokeWorkOrderTracking :exec
DELETE FROM work_order_tracking_share WHERE work_order_id = $1;

-- name: GetPublicWorkOrderTracking :one
SELECT wo.number, wo.status, wo.customer_update, wo.estimated_ready_at, wo.tracking_updated_at,
       wo.received_at, wo.completed_at, wo.cancelled_at,
       w.name AS workshop_name, b.name AS branch_name,
       v.make, v.model, v.year, s.expires_at
FROM work_order_tracking_share s
JOIN work_order wo ON wo.id = s.work_order_id
JOIN workshop w ON w.id = wo.workshop_id
JOIN branch b ON b.id = wo.branch_id AND b.workshop_id = wo.workshop_id
JOIN vehicle v ON v.id = wo.vehicle_id
WHERE s.token_hash = $1 AND s.expires_at > now();
