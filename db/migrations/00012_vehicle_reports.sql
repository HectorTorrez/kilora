-- +goose Up
-- Reporte del historial que el propietario comparte por enlace, por ejemplo
-- al vender el vehículo. Solo se guarda el hash del token. summary es el
-- resumen redactado con IA al crear el enlace (puede faltar).
CREATE TABLE vehicle_report (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id uuid NOT NULL REFERENCES vehicle(id) ON DELETE CASCADE,
    created_by uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    summary    text,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz
);
CREATE INDEX vehicle_report_vehicle_id_idx ON vehicle_report(vehicle_id);
CREATE INDEX vehicle_report_created_by_idx ON vehicle_report(created_by);
-- +goose Down
DROP TABLE vehicle_report;
