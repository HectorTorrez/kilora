-- +goose Up
CREATE TABLE owner_vehicle_maintenance (
    vehicle_id uuid PRIMARY KEY REFERENCES vehicle(id) ON DELETE CASCADE,
    email_reminders boolean NOT NULL DEFAULT false,
    intervals jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(intervals) = 'object'),
    last_sent_at timestamptz
);

-- +goose Down
DROP TABLE owner_vehicle_maintenance;
