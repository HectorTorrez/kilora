-- name: InsertAuditEvent :one
INSERT INTO audit_event (actor_user_id, workshop_id, entity, entity_id, action, diff) VALUES (sqlc.arg(actor_user_id), sqlc.arg(workshop_id), sqlc.arg(entity), sqlc.arg(entity_id), sqlc.arg(action), sqlc.arg(diff)) RETURNING *;

-- name: ListAuditEventsByWorkshop :many
SELECT a.id, a.entity, a.entity_id, a.action, a.created_at, u.full_name AS actor_name
FROM audit_event a LEFT JOIN app_user u ON u.id = a.actor_user_id
WHERE a.workshop_id = sqlc.arg(workshop_id) AND (sqlc.narg(before)::bigint IS NULL OR a.id < sqlc.narg(before)::bigint)
ORDER BY a.id DESC
LIMIT sqlc.arg(row_limit);

-- name: ListAuditEventsPage :many
SELECT a.id, a.entity, a.entity_id, a.action, a.created_at, u.full_name AS actor_name
FROM audit_event a LEFT JOIN app_user u ON u.id = a.actor_user_id
WHERE a.workshop_id = sqlc.arg(workshop_id)
ORDER BY a.id DESC
LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset);

-- name: CountAuditEvents :one
SELECT count(*) FROM audit_event WHERE workshop_id = sqlc.arg(workshop_id);
