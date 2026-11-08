-- name: CreateMembership :one
INSERT INTO membership (user_id, workshop_id, branch_id, role) VALUES (sqlc.arg(user_id), sqlc.arg(workshop_id), sqlc.arg(branch_id), sqlc.arg(role)) RETURNING *;

-- name: ListMembershipsByUser :many
SELECT m.*, w.name AS workshop_name, b.name AS branch_name FROM membership m JOIN workshop w ON w.id = m.workshop_id JOIN branch b ON b.id = m.branch_id AND b.workshop_id = m.workshop_id WHERE m.user_id = sqlc.arg(user_id);

-- name: ListMembersByWorkshop :many
SELECT m.id, m.user_id, m.branch_id, m.role, m.created_at, u.full_name, u.email::text AS email, b.name AS branch_name
FROM membership m JOIN app_user u ON u.id = m.user_id JOIN branch b ON b.id = m.branch_id AND b.workshop_id = m.workshop_id
WHERE m.workshop_id = sqlc.arg(workshop_id)
ORDER BY u.full_name, b.name;

-- name: GetMembershipInWorkshop :one
SELECT * FROM membership WHERE id = sqlc.arg(id) AND workshop_id = sqlc.arg(workshop_id);

-- name: DeleteMembership :execrows
DELETE FROM membership WHERE id = sqlc.arg(id) AND workshop_id = sqlc.arg(workshop_id);

-- name: CountAdmins :one
SELECT count(*) FROM membership WHERE workshop_id = sqlc.arg(workshop_id) AND role = 'admin';
