-- name: CreateWorkshop :one
INSERT INTO workshop (name, nit) VALUES (sqlc.arg(name), sqlc.arg(nit)) RETURNING *;

-- name: GetWorkshop :one
SELECT * FROM workshop WHERE id = sqlc.arg(workshop_id);

-- name: VerifyWorkshop :execrows
UPDATE workshop SET verified_at = now(), verified_by = sqlc.arg(verified_by) WHERE id = sqlc.arg(workshop_id);

-- name: CreateBranch :one
INSERT INTO branch (workshop_id, name, address, phone) VALUES (sqlc.arg(workshop_id), sqlc.arg(name), sqlc.arg(address), sqlc.arg(phone)) RETURNING *;

-- name: ListBranchesByWorkshop :many
SELECT * FROM branch WHERE workshop_id = sqlc.arg(workshop_id) ORDER BY name;

-- name: GetBranch :one
SELECT * FROM branch WHERE id = sqlc.arg(id) AND workshop_id = sqlc.arg(workshop_id);
