-- name: InsertAuditEvent :one
INSERT INTO audit_event (actor_user_id, workshop_id, entity, entity_id, action, diff) VALUES (sqlc.arg(actor_user_id), sqlc.arg(workshop_id), sqlc.arg(entity), sqlc.arg(entity_id), sqlc.arg(action), sqlc.arg(diff)) RETURNING *;

-- name: ListAuditEventsByEntity :many
SELECT * FROM audit_event WHERE workshop_id = sqlc.arg(workshop_id) AND entity = sqlc.arg(entity) AND entity_id = sqlc.arg(entity_id) ORDER BY created_at DESC;
