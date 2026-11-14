-- +goose Up
ALTER TABLE work_order
    ADD COLUMN customer_update text CHECK (char_length(customer_update) <= 1000),
    ADD COLUMN estimated_ready_at timestamptz CHECK (estimated_ready_at >= received_at),
    ADD COLUMN tracking_updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE work_order_tracking_share (
    work_order_id uuid PRIMARY KEY REFERENCES work_order(id) ON DELETE CASCADE,
    token_hash text UNIQUE NOT NULL CHECK (length(token_hash) = 64),
    shared_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    created_by uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
    CHECK (expires_at > shared_at)
);

-- +goose Down
DROP TABLE work_order_tracking_share;
ALTER TABLE work_order DROP COLUMN customer_update, DROP COLUMN estimated_ready_at, DROP COLUMN tracking_updated_at;
