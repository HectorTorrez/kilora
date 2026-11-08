-- name: GetQuoteIDByOrder :one
SELECT id FROM quote WHERE work_order_id = $1 AND workshop_id = $2;

-- name: UpsertQuote :one
INSERT INTO quote(work_order_id, workshop_id, total, created_by) VALUES ($1, $2, $3, $4)
ON CONFLICT(work_order_id) DO UPDATE SET total = EXCLUDED.total WHERE quote.outcome = 'pendiente'
RETURNING id, outcome;

-- name: DeleteQuoteItems :exec
DELETE FROM quote_item WHERE quote_id = $1;

-- name: CreateQuoteItem :exec
INSERT INTO quote_item(quote_id, position, kind, description, quantity, unit_price) VALUES ($1, $2, $3, $4, $5, $6);

-- name: GetQuoteData :one
SELECT total::text, currency, outcome::text, outcome_at, outcome_by, shared_at, share_expires_at FROM quote WHERE id = $1;

-- name: ListQuoteItems :many
SELECT kind::text, description, quantity::text, unit_price::text FROM quote_item WHERE quote_id = $1 ORDER BY position;

-- name: ShareQuote :one
UPDATE quote SET share_token_hash = $1, shared_at = now(), share_expires_at = now() + interval '15 days' WHERE work_order_id = $2 AND workshop_id = $3 RETURNING id, share_expires_at, total::text;

-- name: GetQuoteContact :one
SELECT w.name, v.plate, v.contact_phone FROM work_order o JOIN workshop w ON w.id = o.workshop_id JOIN vehicle v ON v.id = o.vehicle_id WHERE o.id = $1;

-- name: SetQuoteOutcome :one
UPDATE quote SET outcome = $1, outcome_at = now(), outcome_by = $2 WHERE work_order_id = $3 AND workshop_id = $4 RETURNING id;

-- name: GetPublicQuote :one
SELECT q.id, w.name, w.verified_at, v.plate, v.make, v.model, v.year, o.number, q.shared_at, q.share_expires_at FROM quote q JOIN work_order o ON o.id = q.work_order_id JOIN workshop w ON w.id = q.workshop_id JOIN vehicle v ON v.id = o.vehicle_id WHERE q.share_token_hash = $1 AND q.share_expires_at > now();
