-- +goose Up
CREATE TABLE history_receipt (
    history_record_id uuid PRIMARY KEY REFERENCES history_record(id) ON DELETE CASCADE,
    filename text NOT NULL CHECK (length(filename) BETWEEN 1 AND 180),
    content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
    data bytea NOT NULL CHECK (octet_length(data) BETWEEN 1 AND 4194304),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE history_receipt;
