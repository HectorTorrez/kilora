-- name: ListKnowledgeChunks :many
SELECT * FROM assistant_knowledge_chunk WHERE model = $1 ORDER BY source, id;

-- name: InsertKnowledgeChunk :exec
INSERT INTO assistant_knowledge_chunk (id, source, title, content, model, embedding)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (id) DO NOTHING;

-- name: DeleteKnowledgeChunksExcept :exec
DELETE FROM assistant_knowledge_chunk WHERE NOT (id = ANY(sqlc.arg(keep)::text[]));
