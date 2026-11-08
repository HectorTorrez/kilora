-- +goose Up
CREATE TABLE invitation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vehicle_id uuid NOT NULL REFERENCES vehicle(id),
 workshop_id uuid NOT NULL REFERENCES workshop(id), email citext NOT NULL, token_hash text UNIQUE NOT NULL,
 expires_at timestamptz NOT NULL, created_by uuid NOT NULL REFERENCES app_user(id), created_at timestamptz NOT NULL DEFAULT now(),
 accepted_at timestamptz, accepted_by uuid REFERENCES app_user(id), consent_at timestamptz, revoked_at timestamptz
);
CREATE INDEX invitation_vehicle_id_idx ON invitation(vehicle_id);
-- +goose Down
DROP TABLE invitation;
