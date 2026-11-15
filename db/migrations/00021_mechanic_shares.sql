-- +goose Up
CREATE TABLE vehicle_mechanic_share (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id uuid NOT NULL REFERENCES vehicle(id) ON DELETE CASCADE,
    created_by uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    record_ids uuid[] NOT NULL CHECK (cardinality(record_ids) BETWEEN 1 AND 200),
    include_maintenance boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz
);
CREATE UNIQUE INDEX vehicle_mechanic_share_active_idx ON vehicle_mechanic_share(vehicle_id) WHERE revoked_at IS NULL;

-- +goose Down
DROP TABLE vehicle_mechanic_share;
