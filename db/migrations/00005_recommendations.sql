-- +goose Up
CREATE TYPE recommendation_status AS ENUM ('pendiente', 'hecha', 'descartada');
CREATE TABLE recommendation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vehicle_id uuid NOT NULL REFERENCES vehicle(id) ON DELETE RESTRICT,
 workshop_id uuid NOT NULL REFERENCES workshop(id) ON DELETE RESTRICT, work_order_id uuid REFERENCES work_order(id) ON DELETE RESTRICT,
 description text NOT NULL CHECK (length(trim(description)) > 0), category part_category,
 due_date date, due_km int CHECK (due_km >= 0),
 status recommendation_status NOT NULL DEFAULT 'pendiente', resolved_at timestamptz, resolved_by uuid REFERENCES app_user(id) ON DELETE RESTRICT,
 created_by uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (status = 'pendiente' OR resolved_at IS NOT NULL)
);
CREATE INDEX recommendation_vehicle_id_idx ON recommendation(vehicle_id);
CREATE INDEX recommendation_workshop_status_idx ON recommendation(workshop_id, status);
CREATE INDEX recommendation_work_order_id_idx ON recommendation(work_order_id);
CREATE INDEX recommendation_created_by_idx ON recommendation(created_by);
CREATE INDEX recommendation_resolved_by_idx ON recommendation(resolved_by);
-- +goose Down
DROP TABLE recommendation;
DROP TYPE recommendation_status;
