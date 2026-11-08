-- name: CreateJob :one
INSERT INTO job (work_order_id, position, description, category, labor_price, internal_cost, mechanic_notes, currency) SELECT wo.id, sqlc.arg(position), sqlc.arg(description), sqlc.narg(category), sqlc.narg(labor_price), sqlc.narg(internal_cost), sqlc.narg(mechanic_notes), sqlc.arg(currency) FROM work_order wo WHERE wo.id = sqlc.arg(work_order_id) AND wo.workshop_id = sqlc.arg(workshop_id) RETURNING *;

-- name: ListJobsByWorkOrder :many
SELECT j.* FROM job j JOIN work_order wo ON wo.id = j.work_order_id WHERE wo.id = sqlc.arg(work_order_id) AND wo.workshop_id = sqlc.arg(workshop_id) ORDER BY j.position;

-- name: DeleteJob :execrows
DELETE FROM job j USING work_order wo WHERE j.work_order_id = wo.id AND j.id = sqlc.arg(id) AND wo.workshop_id = sqlc.arg(workshop_id);

-- name: CreatePart :one
INSERT INTO part (job_id, name, brand, model, quantity, unit_price, internal_cost, currency) SELECT j.id, sqlc.arg(name), sqlc.narg(brand), sqlc.narg(model), sqlc.arg(quantity), sqlc.narg(unit_price), sqlc.narg(internal_cost), sqlc.arg(currency) FROM job j JOIN work_order wo ON wo.id = j.work_order_id WHERE j.id = sqlc.arg(job_id) AND wo.workshop_id = sqlc.arg(workshop_id) RETURNING *;

-- name: ListPartsByWorkOrder :many
SELECT p.* FROM part p JOIN job j ON j.id = p.job_id JOIN work_order wo ON wo.id = j.work_order_id WHERE wo.id = sqlc.arg(work_order_id) AND wo.workshop_id = sqlc.arg(workshop_id) ORDER BY j.position, p.created_at;

-- name: DeletePart :execrows
DELETE FROM part p USING job j, work_order wo WHERE p.job_id = j.id AND j.work_order_id = wo.id AND p.id = sqlc.arg(id) AND p.job_id = sqlc.arg(job_id) AND wo.workshop_id = sqlc.arg(workshop_id);

-- name: GetJob :one
SELECT j.* FROM job j JOIN work_order wo ON wo.id = j.work_order_id WHERE j.id = sqlc.arg(id) AND j.work_order_id = sqlc.arg(work_order_id) AND wo.workshop_id = sqlc.arg(workshop_id);

-- name: NextJobPosition :one
SELECT (COALESCE(MAX(position), -1) + 1)::int AS position FROM job WHERE work_order_id = sqlc.arg(work_order_id);
