-- name: CreateHistoryReceipt :exec
INSERT INTO history_receipt (history_record_id, filename, content_type, data)
VALUES ($1, $2, $3, $4);

-- name: ListHistoryReceiptMetadata :many
SELECT history_record_id, filename, content_type, octet_length(data)::int AS size_bytes
FROM history_receipt WHERE history_record_id = ANY(sqlc.arg(record_ids)::uuid[]);

-- name: GetHistoryReceiptForOwner :one
SELECT hr.filename, hr.content_type, hr.data
FROM history_receipt hr
JOIN history_record h ON h.id = hr.history_record_id
JOIN vehicle v ON v.id = h.vehicle_id
WHERE h.id = sqlc.arg(record_id) AND h.vehicle_id = sqlc.arg(vehicle_id)
AND v.owner_user_id = sqlc.arg(owner_user_id);
