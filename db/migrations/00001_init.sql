-- +goose Up
CREATE EXTENSION IF NOT EXISTS citext;
CREATE TYPE membership_role AS ENUM ('admin', 'recepcion', 'mecanico');
CREATE TYPE vehicle_status AS ENUM ('provisional', 'vinculado', 'archivado');
CREATE TYPE work_order_status AS ENUM ('recibido', 'diagnostico', 'en_reparacion', 'listo', 'cancelado');
CREATE TYPE part_category AS ENUM ('aceite', 'frenos', 'amortiguadores', 'bateria', 'llantas', 'otro');
CREATE TYPE history_source AS ENUM ('taller', 'propietario');
CREATE TYPE odometer_source AS ENUM ('orden', 'propietario', 'taller');

CREATE TABLE app_user (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email citext UNIQUE NOT NULL,
 password_hash text NOT NULL, full_name text NOT NULL, phone text,
 email_verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE workshop (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, nit text,
 verified_at timestamptz, verified_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE branch (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workshop_id uuid NOT NULL REFERENCES workshop(id) ON DELETE RESTRICT,
 name text NOT NULL, address text, phone text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (workshop_id, name), UNIQUE (id, workshop_id)
);
CREATE TABLE membership (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
 workshop_id uuid NOT NULL REFERENCES workshop(id) ON DELETE RESTRICT, branch_id uuid NOT NULL,
 role membership_role NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (user_id, branch_id), FOREIGN KEY (branch_id, workshop_id) REFERENCES branch(id, workshop_id) ON DELETE RESTRICT
);
CREATE TABLE vehicle (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id uuid REFERENCES app_user(id) ON DELETE RESTRICT,
 created_by_workshop_id uuid REFERENCES workshop(id) ON DELETE RESTRICT, status vehicle_status NOT NULL,
 plate text CHECK (plate = upper(plate) AND plate !~ '[[:space:]-]'), make text NOT NULL, model text NOT NULL,
 year int CHECK (year BETWEEN 1886 AND 2100), vin text, contact_name text, contact_phone text,
 last_activity_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE vehicle_link (
 vehicle_id uuid NOT NULL REFERENCES vehicle(id) ON DELETE RESTRICT, workshop_id uuid NOT NULL REFERENCES workshop(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (vehicle_id, workshop_id)
);
CREATE TABLE work_order (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workshop_id uuid NOT NULL REFERENCES workshop(id) ON DELETE RESTRICT,
 branch_id uuid NOT NULL, vehicle_id uuid NOT NULL REFERENCES vehicle(id) ON DELETE RESTRICT,
 number int NOT NULL, status work_order_status NOT NULL DEFAULT 'recibido', reason text NOT NULL,
 odometer_km int CHECK (odometer_km >= 0), internal_notes text, received_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz, cancelled_at timestamptz, cancel_reason text,
 created_by uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (workshop_id, number), FOREIGN KEY (branch_id, workshop_id) REFERENCES branch(id, workshop_id) ON DELETE RESTRICT,
 CHECK (status <> 'cancelado' OR cancelled_at IS NOT NULL)
);
CREATE TABLE job (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), work_order_id uuid NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
 position int NOT NULL, description text NOT NULL, category part_category, labor_price numeric(12,2), internal_cost numeric(12,2),
 mechanic_notes text, currency char(3) NOT NULL DEFAULT 'USD', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE part (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL REFERENCES job(id) ON DELETE CASCADE,
 name text NOT NULL, brand text, model text, quantity numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
 unit_price numeric(12,2), internal_cost numeric(12,2), currency char(3) NOT NULL DEFAULT 'USD', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE history_record (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vehicle_id uuid NOT NULL REFERENCES vehicle(id) ON DELETE RESTRICT,
 workshop_id uuid REFERENCES workshop(id) ON DELETE RESTRICT, work_order_id uuid UNIQUE REFERENCES work_order(id) ON DELETE RESTRICT,
 source history_source NOT NULL, performed_on date NOT NULL, odometer_km int, summary text NOT NULL,
 items jsonb NOT NULL DEFAULT '[]'::jsonb, total numeric(12,2), currency char(3) NOT NULL DEFAULT 'USD',
 workshop_notes text, internal_cost numeric(12,2), internal_notes text, created_by uuid REFERENCES app_user(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK (source <> 'taller' OR workshop_id IS NOT NULL)
);
CREATE TABLE correction (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), history_record_id uuid NOT NULL REFERENCES history_record(id) ON DELETE RESTRICT,
 reason text NOT NULL, changes jsonb NOT NULL, created_by uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE odometer_reading (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vehicle_id uuid NOT NULL REFERENCES vehicle(id) ON DELETE RESTRICT,
 km int NOT NULL CHECK (km >= 0), read_at timestamptz NOT NULL DEFAULT now(), source odometer_source NOT NULL,
 work_order_id uuid REFERENCES work_order(id) ON DELETE RESTRICT, recorded_by uuid REFERENCES app_user(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_event (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_user_id uuid REFERENCES app_user(id) ON DELETE RESTRICT,
 workshop_id uuid REFERENCES workshop(id) ON DELETE RESTRICT, entity text NOT NULL, entity_id uuid,
 action text NOT NULL, diff jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX membership_workshop_id_idx ON membership(workshop_id);
CREATE INDEX membership_branch_id_workshop_id_idx ON membership(branch_id, workshop_id);
CREATE INDEX vehicle_plate_idx ON vehicle(plate);
CREATE INDEX vehicle_owner_user_id_idx ON vehicle(owner_user_id);
CREATE INDEX vehicle_created_by_workshop_id_idx ON vehicle(created_by_workshop_id);
CREATE INDEX vehicle_link_workshop_id_idx ON vehicle_link(workshop_id);
CREATE INDEX work_order_branch_id_workshop_id_idx ON work_order(branch_id, workshop_id);
CREATE INDEX work_order_vehicle_id_idx ON work_order(vehicle_id);
CREATE INDEX work_order_created_by_idx ON work_order(created_by);
CREATE INDEX job_work_order_id_idx ON job(work_order_id);
CREATE INDEX part_job_id_idx ON part(job_id);
CREATE INDEX history_record_vehicle_id_idx ON history_record(vehicle_id);
CREATE INDEX history_record_workshop_id_idx ON history_record(workshop_id);
CREATE INDEX history_record_created_by_idx ON history_record(created_by);
CREATE INDEX correction_history_record_id_idx ON correction(history_record_id);
CREATE INDEX correction_created_by_idx ON correction(created_by);
CREATE INDEX odometer_reading_vehicle_read_at_idx ON odometer_reading(vehicle_id, read_at DESC);
CREATE INDEX odometer_reading_work_order_id_idx ON odometer_reading(work_order_id);
CREATE INDEX odometer_reading_recorded_by_idx ON odometer_reading(recorded_by);
CREATE INDEX audit_event_actor_user_id_idx ON audit_event(actor_user_id);
CREATE INDEX audit_event_entity_idx ON audit_event(entity, entity_id);
CREATE INDEX audit_event_workshop_created_at_idx ON audit_event(workshop_id, created_at);

-- +goose StatementBegin
CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'No se permite modificar ni eliminar registros de %', TG_TABLE_NAME;
END;
$$;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.updated_at = now();
 RETURN NEW;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER history_record_append_only BEFORE UPDATE OR DELETE ON history_record FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER correction_append_only BEFORE UPDATE OR DELETE ON correction FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER audit_event_append_only BEFORE UPDATE OR DELETE ON audit_event FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER app_user_updated_at BEFORE UPDATE ON app_user FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER workshop_updated_at BEFORE UPDATE ON workshop FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER vehicle_updated_at BEFORE UPDATE ON vehicle FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER work_order_updated_at BEFORE UPDATE ON work_order FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +goose Down
DROP TABLE audit_event, odometer_reading, correction, history_record, part, job, work_order, vehicle_link, vehicle, membership, branch, workshop, app_user;
DROP FUNCTION set_updated_at();
DROP FUNCTION forbid_mutation();
DROP TYPE odometer_source, history_source, part_category, work_order_status, vehicle_status, membership_role;
DROP EXTENSION citext;
