-- name: CreateCustomer :one
INSERT INTO customer (workshop_id, full_name, phone, email)
VALUES (sqlc.arg(workshop_id), sqlc.arg(full_name), sqlc.arg(phone), sqlc.narg(email))
RETURNING *;

-- name: GetCustomer :one
SELECT * FROM customer WHERE id = sqlc.arg(id) AND workshop_id = sqlc.arg(workshop_id);

-- name: GetCustomerByPhone :one
SELECT * FROM customer WHERE workshop_id = sqlc.arg(workshop_id) AND phone = sqlc.arg(phone);

-- name: UpdateCustomer :one
UPDATE customer SET full_name = sqlc.arg(full_name), phone = sqlc.arg(phone), email = sqlc.narg(email)
WHERE id = sqlc.arg(id) AND workshop_id = sqlc.arg(workshop_id)
RETURNING *;

-- name: ListCustomersPage :many
SELECT c.*,
  (SELECT count(*) FROM vehicle_link l JOIN vehicle v ON v.id = l.vehicle_id
   WHERE l.customer_id = c.id AND v.status <> 'archivado')::int AS vehicle_count
FROM customer c
WHERE c.workshop_id = sqlc.arg(workshop_id)
  AND (sqlc.narg(search)::text IS NULL OR regexp_replace(lower(concat_ws(' ', c.full_name, c.phone, c.email)), '[[:space:]-]', '', 'g') ILIKE sqlc.narg(search) ESCAPE '\')
ORDER BY lower(c.full_name), c.id
LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset);

-- name: CountCustomers :one
SELECT count(*) FROM customer c
WHERE c.workshop_id = sqlc.arg(workshop_id)
  AND (sqlc.narg(search)::text IS NULL OR regexp_replace(lower(concat_ws(' ', c.full_name, c.phone, c.email)), '[[:space:]-]', '', 'g') ILIKE sqlc.narg(search) ESCAPE '\');

-- name: ListCustomerVehicles :many
SELECT v.* FROM vehicle v JOIN vehicle_link l ON l.vehicle_id = v.id
WHERE l.workshop_id = sqlc.arg(workshop_id) AND l.customer_id = sqlc.arg(customer_id)
ORDER BY v.status = 'archivado', v.last_activity_at DESC;

-- name: GetVehicleCustomer :one
SELECT c.* FROM vehicle_link l JOIN customer c ON c.id = l.customer_id
WHERE l.vehicle_id = sqlc.arg(vehicle_id) AND l.workshop_id = sqlc.arg(workshop_id);

-- name: SetVehicleCustomer :execrows
UPDATE vehicle_link SET customer_id = sqlc.arg(customer_id)
WHERE vehicle_id = sqlc.arg(vehicle_id) AND workshop_id = sqlc.arg(workshop_id);

-- name: LinkVehicleCustomerUser :exec
UPDATE customer c SET user_id = sqlc.arg(user_id)
FROM vehicle_link l
WHERE l.customer_id = c.id AND l.vehicle_id = sqlc.arg(vehicle_id) AND l.workshop_id = sqlc.arg(workshop_id) AND c.user_id IS NULL;
