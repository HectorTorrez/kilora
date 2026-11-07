-- name: CreateMembership :one
INSERT INTO membership (user_id, workshop_id, branch_id, role) VALUES (sqlc.arg(user_id), sqlc.arg(workshop_id), sqlc.arg(branch_id), sqlc.arg(role)) RETURNING *;

-- name: ListMembershipsByUser :many
SELECT m.*, w.name AS workshop_name, b.name AS branch_name FROM membership m JOIN workshop w ON w.id = m.workshop_id JOIN branch b ON b.id = m.branch_id AND b.workshop_id = m.workshop_id WHERE m.user_id = sqlc.arg(user_id);

-- name: GetMembership :one
SELECT * FROM membership WHERE user_id = sqlc.arg(user_id) AND branch_id = sqlc.arg(branch_id);
