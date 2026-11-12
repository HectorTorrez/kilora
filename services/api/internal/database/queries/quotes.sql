-- name: GetOrderQuoteMeta :one
SELECT id, number FROM quote WHERE work_order_id = sqlc.arg(work_order_id) AND workshop_id = sqlc.arg(workshop_id);

-- name: NextQuoteNumber :one
SELECT (COALESCE(MAX(number), 0) + 1)::int AS number FROM quote WHERE workshop_id = sqlc.arg(workshop_id);

-- name: UpsertQuote :one
INSERT INTO quote (work_order_id, workshop_id, branch_id, number, total, created_by)
VALUES (sqlc.arg(work_order_id), sqlc.arg(workshop_id), sqlc.arg(branch_id), sqlc.arg(number), sqlc.arg(total), sqlc.arg(created_by))
ON CONFLICT (work_order_id) DO UPDATE SET total = EXCLUDED.total WHERE quote.outcome = 'pendiente'
RETURNING id, outcome;

-- name: DeleteQuoteItems :exec
DELETE FROM quote_item WHERE quote_id = $1;

-- name: CreateQuoteItem :exec
INSERT INTO quote_item(quote_id, position, kind, description, quantity, unit_price, part, brand) VALUES ($1, $2, $3, $4, $5, $6, sqlc.narg(part), sqlc.narg(brand));

-- name: GetQuoteData :one
SELECT total::text, currency, outcome, outcome_at, outcome_by, shared_at, share_expires_at FROM quote WHERE id = $1;

-- name: ListQuoteItems :many
SELECT kind, description, quantity::text, unit_price::text, part, brand FROM quote_item WHERE quote_id = $1 ORDER BY position;

-- name: ShareQuote :one
UPDATE quote SET share_token_hash = $1, shared_at = now(), share_expires_at = now() + interval '15 days' WHERE work_order_id = $2 AND workshop_id = $3 RETURNING id, share_expires_at, total::text;

-- name: GetQuoteContact :one
SELECT w.name, v.plate, c.phone AS customer_phone
FROM work_order o
JOIN workshop w ON w.id = o.workshop_id
JOIN vehicle v ON v.id = o.vehicle_id
LEFT JOIN vehicle_link l ON l.vehicle_id = o.vehicle_id AND l.workshop_id = o.workshop_id
LEFT JOIN customer c ON c.id = l.customer_id
WHERE o.id = $1;

-- name: SetQuoteOutcome :one
UPDATE quote SET outcome = $1, outcome_at = now(), outcome_by = $2 WHERE work_order_id = $3 AND workshop_id = $4 AND converted_order_id IS NULL RETURNING id;

-- name: GetPublicQuote :one
SELECT q.id, w.name, w.verified_at,
  COALESCE(q.vehicle_plate, v.plate) AS plate,
  COALESCE(q.vehicle_make, v.make, '') AS make,
  COALESCE(q.vehicle_model, v.model, '') AS model,
  COALESCE(q.vehicle_year, v.year) AS year,
  o.number AS order_number,
  q.number AS quote_number,
  q.customer_name,
  q.notes,
  q.valid_until,
  q.shared_at,
  q.share_expires_at,
  v.body_type
FROM quote q
JOIN workshop w ON w.id = q.workshop_id
LEFT JOIN work_order o ON o.id = q.work_order_id
LEFT JOIN vehicle v ON v.id = COALESCE(o.vehicle_id, q.vehicle_id)
WHERE q.share_token_hash = $1 AND q.share_expires_at > now();

-- name: CreateCounterQuote :one
INSERT INTO quote (
  workshop_id, branch_id, number, customer_id, customer_name, customer_phone, vehicle_id,
  vehicle_make, vehicle_model, vehicle_year, vehicle_plate, notes, valid_until, total, created_by
) VALUES (
  sqlc.arg(workshop_id), sqlc.arg(branch_id), sqlc.arg(number), sqlc.narg(customer_id), sqlc.arg(customer_name), sqlc.narg(customer_phone), sqlc.narg(vehicle_id),
  sqlc.narg(vehicle_make), sqlc.arg(vehicle_model), sqlc.narg(vehicle_year), sqlc.narg(vehicle_plate), sqlc.narg(notes), sqlc.arg(valid_until), sqlc.arg(total), sqlc.arg(created_by)
) RETURNING *;

-- name: UpdateCounterQuote :one
UPDATE quote SET
  branch_id = sqlc.arg(branch_id),
  customer_id = sqlc.narg(customer_id),
  customer_name = sqlc.arg(customer_name),
  customer_phone = sqlc.narg(customer_phone),
  vehicle_id = sqlc.narg(vehicle_id),
  vehicle_make = sqlc.narg(vehicle_make),
  vehicle_model = sqlc.arg(vehicle_model),
  vehicle_year = sqlc.narg(vehicle_year),
  vehicle_plate = sqlc.narg(vehicle_plate),
  notes = sqlc.narg(notes),
  valid_until = sqlc.arg(valid_until),
  total = sqlc.arg(total)
WHERE id = sqlc.arg(id) AND workshop_id = sqlc.arg(workshop_id)
  AND outcome = 'pendiente' AND converted_order_id IS NULL AND work_order_id IS NULL
RETURNING id;

-- name: GetCounterQuote :one
SELECT
  q.id, q.workshop_id, q.branch_id, q.number, q.customer_id, q.customer_name, q.customer_phone, q.vehicle_id,
  q.vehicle_make, q.vehicle_model, q.vehicle_year, q.vehicle_plate, q.notes, q.valid_until,
  q.total::text AS total, q.currency, q.outcome, q.outcome_at, q.outcome_by,
  q.shared_at, q.share_expires_at, q.created_at, q.work_order_id, q.converted_order_id,
  w.name AS workshop_name, w.nit AS workshop_nit, w.verified_at, b.name AS branch_name,
  o.number AS converted_order_number
FROM quote q
JOIN workshop w ON w.id = q.workshop_id
JOIN branch b ON b.id = q.branch_id
LEFT JOIN work_order o ON o.id = q.converted_order_id
WHERE q.id = sqlc.arg(id) AND q.workshop_id = sqlc.arg(workshop_id)
  AND (q.work_order_id IS NULL OR q.converted_order_id IS NOT NULL);

-- name: ListCounterQuotes :many
SELECT
  q.id, q.number, q.customer_name, q.customer_phone, q.vehicle_make, q.vehicle_model, q.vehicle_year, q.vehicle_plate,
  q.total::text AS total, q.currency, q.outcome, q.created_at, q.valid_until,
  q.converted_order_id, o.number AS converted_order_number, COUNT(*) OVER() AS total_count
FROM quote q
LEFT JOIN work_order o ON o.id = q.converted_order_id
WHERE q.workshop_id = sqlc.arg(workshop_id)
  AND q.branch_id = ANY(sqlc.arg(branch_ids)::uuid[])
  AND (q.work_order_id IS NULL OR q.converted_order_id IS NOT NULL)
  AND (cardinality(sqlc.arg(outcomes)::text[]) = 0 OR q.outcome::text = ANY(sqlc.arg(outcomes)::text[]))
  AND (
    sqlc.narg(search)::text IS NULL
    OR q.customer_name ILIKE sqlc.narg(search) ESCAPE '\'
    OR COALESCE(q.customer_phone, '') ILIKE sqlc.narg(search) ESCAPE '\'
    OR COALESCE(q.vehicle_plate, '') ILIKE sqlc.narg(search) ESCAPE '\'
    OR q.number::text ILIKE sqlc.narg(search) ESCAPE '\'
    OR ('COT-' || lpad(q.number::text, 4, '0')) ILIKE sqlc.narg(search) ESCAPE '\'
  )
  AND (sqlc.narg(date_from)::date IS NULL OR (q.created_at AT TIME ZONE 'America/El_Salvador')::date >= sqlc.narg(date_from)::date)
  AND (sqlc.narg(date_to)::date IS NULL OR (q.created_at AT TIME ZONE 'America/El_Salvador')::date <= sqlc.narg(date_to)::date)
ORDER BY q.created_at DESC, q.number DESC
LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset);

-- name: LockCounterQuote :one
SELECT id, number, outcome, branch_id, vehicle_id, customer_id, customer_name, customer_phone,
  vehicle_make, vehicle_model, vehicle_year, vehicle_plate, work_order_id, converted_order_id
FROM quote
WHERE id = sqlc.arg(id) AND workshop_id = sqlc.arg(workshop_id)
  AND (work_order_id IS NULL OR converted_order_id IS NOT NULL)
FOR UPDATE;

-- name: MarkQuoteConverted :one
UPDATE quote SET
  work_order_id = sqlc.arg(work_order_id),
  converted_order_id = sqlc.arg(converted_order_id),
  outcome = 'acepto',
  outcome_at = now(),
  outcome_by = sqlc.arg(outcome_by)
WHERE id = sqlc.arg(id) AND workshop_id = sqlc.arg(workshop_id)
  AND work_order_id IS NULL AND converted_order_id IS NULL AND outcome <> 'rechazo'
RETURNING id;

-- name: SetCounterQuoteOutcome :one
UPDATE quote SET outcome = sqlc.arg(outcome), outcome_at = now(), outcome_by = sqlc.arg(outcome_by)
WHERE id = sqlc.arg(id) AND workshop_id = sqlc.arg(workshop_id)
  AND work_order_id IS NULL AND converted_order_id IS NULL
RETURNING id;

-- name: ShareCounterQuote :one
UPDATE quote SET share_token_hash = sqlc.arg(share_token_hash), shared_at = now(), share_expires_at = now() + interval '15 days'
WHERE id = sqlc.arg(id) AND workshop_id = sqlc.arg(workshop_id)
  AND (work_order_id IS NULL OR converted_order_id IS NOT NULL)
RETURNING id, share_expires_at, total::text;

-- name: CountCounterQuotesByOutcome :many
SELECT q.outcome, count(*) AS total
FROM quote q
LEFT JOIN work_order o ON o.id = q.converted_order_id
WHERE q.workshop_id = sqlc.arg(workshop_id)
  AND q.branch_id = ANY(sqlc.arg(branch_ids)::uuid[])
  AND (q.work_order_id IS NULL OR q.converted_order_id IS NOT NULL)
  AND (
    sqlc.narg(search)::text IS NULL
    OR q.customer_name ILIKE sqlc.narg(search) ESCAPE '\'
    OR COALESCE(q.customer_phone, '') ILIKE sqlc.narg(search) ESCAPE '\'
    OR COALESCE(q.vehicle_plate, '') ILIKE sqlc.narg(search) ESCAPE '\'
    OR q.number::text ILIKE sqlc.narg(search) ESCAPE '\'
    OR ('COT-' || lpad(q.number::text, 4, '0')) ILIKE sqlc.narg(search) ESCAPE '\'
  )
  AND (sqlc.narg(date_from)::date IS NULL OR (q.created_at AT TIME ZONE 'America/El_Salvador')::date >= sqlc.narg(date_from)::date)
  AND (sqlc.narg(date_to)::date IS NULL OR (q.created_at AT TIME ZONE 'America/El_Salvador')::date <= sqlc.narg(date_to)::date)
GROUP BY q.outcome;
