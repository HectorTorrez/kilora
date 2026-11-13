-- +goose Up
ALTER TABLE history_receipt ADD COLUMN content_hash bytea GENERATED ALWAYS AS (sha256(data)) STORED;
CREATE INDEX history_receipt_content_hash_idx ON history_receipt(content_hash);

-- +goose Down
ALTER TABLE history_receipt DROP COLUMN content_hash;
