-- name: ListQuoteTemplates :many
SELECT id, name, updated_at FROM quote_template WHERE workshop_id = $1 ORDER BY lower(name);

-- name: ListQuoteTemplateItems :many
SELECT i.template_id, i.kind, i.description, i.quantity::text AS quantity, i.unit_price::text AS unit_price, i.part, i.brand
FROM quote_template_item i
JOIN quote_template t ON t.id = i.template_id
WHERE t.workshop_id = $1
ORDER BY i.template_id, i.position;

-- name: CountQuoteTemplates :one
SELECT count(*)::int FROM quote_template WHERE workshop_id = $1;

-- name: CreateQuoteTemplate :one
INSERT INTO quote_template (workshop_id, name, created_by) VALUES ($1, $2, $3)
RETURNING id, name, updated_at;

-- name: UpdateQuoteTemplate :one
UPDATE quote_template SET name = $3 WHERE id = $1 AND workshop_id = $2
RETURNING id, name, updated_at;

-- name: DeleteQuoteTemplate :execrows
DELETE FROM quote_template WHERE id = $1 AND workshop_id = $2;

-- name: DeleteQuoteTemplateItems :exec
DELETE FROM quote_template_item WHERE template_id = $1;

-- name: CreateQuoteTemplateItem :exec
INSERT INTO quote_template_item (template_id, position, kind, description, quantity, unit_price, part, brand)
VALUES ($1, $2, $3, $4, $5, $6, sqlc.narg(part), sqlc.narg(brand));
