-- +goose Up
-- El cliente es del taller, no del vehículo: cada taller guarda su propio contacto
-- y el vehículo (global) se asocia a él a través de vehicle_link. El propietario
-- real sigue siendo vehicle.owner_user_id cuando acepta la invitación.
CREATE TABLE customer (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workshop_id uuid NOT NULL REFERENCES workshop(id) ON DELETE RESTRICT,
 full_name text NOT NULL CHECK (btrim(full_name) <> ''),
 -- Nullable solo por datos heredados sin teléfono; la API lo exige al crear y editar.
 phone text,
 email citext,
 user_id uuid REFERENCES app_user(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id, workshop_id)
);
CREATE UNIQUE INDEX customer_workshop_phone_key ON customer(workshop_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX customer_workshop_name_idx ON customer(workshop_id, full_name);
CREATE INDEX customer_user_id_idx ON customer(user_id);
CREATE TRIGGER customer_updated_at BEFORE UPDATE ON customer FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE vehicle_link ADD COLUMN customer_id uuid;
ALTER TABLE vehicle_link ADD CONSTRAINT vehicle_link_customer_fkey
 FOREIGN KEY (customer_id, workshop_id) REFERENCES customer(id, workshop_id) ON DELETE RESTRICT;
CREATE INDEX vehicle_link_customer_id_idx ON vehicle_link(customer_id);

ALTER TABLE quote ADD COLUMN customer_id uuid;
ALTER TABLE quote ADD CONSTRAINT quote_customer_fkey
 FOREIGN KEY (customer_id, workshop_id) REFERENCES customer(id, workshop_id) ON DELETE RESTRICT;
CREATE INDEX quote_customer_id_idx ON quote(customer_id);

-- Contactos con teléfono: un cliente por (taller, teléfono), con el nombre más reciente.
INSERT INTO customer (workshop_id, full_name, phone, created_at)
SELECT DISTINCT ON (v.created_by_workshop_id, v.contact_phone)
 v.created_by_workshop_id, COALESCE(NULLIF(btrim(v.contact_name), ''), 'Cliente sin nombre'), v.contact_phone, v.created_at
FROM vehicle v
WHERE v.created_by_workshop_id IS NOT NULL AND v.contact_phone IS NOT NULL
ORDER BY v.created_by_workshop_id, v.contact_phone, (NULLIF(btrim(v.contact_name), '') IS NULL), v.last_activity_at DESC;

UPDATE vehicle_link l SET customer_id = c.id
FROM vehicle v JOIN customer c ON c.workshop_id = v.created_by_workshop_id AND c.phone = v.contact_phone
WHERE l.vehicle_id = v.id AND l.workshop_id = v.created_by_workshop_id;

-- Contactos solo con nombre: no hay cómo deduplicarlos, uno por vehículo.
WITH src AS MATERIALIZED (
 SELECT gen_random_uuid() AS customer_id, v.id AS vehicle_id, v.created_by_workshop_id AS workshop_id, btrim(v.contact_name) AS full_name, v.created_at
 FROM vehicle v
 WHERE v.created_by_workshop_id IS NOT NULL AND v.contact_phone IS NULL AND NULLIF(btrim(v.contact_name), '') IS NOT NULL
), inserted AS (
 INSERT INTO customer (id, workshop_id, full_name, created_at)
 SELECT customer_id, workshop_id, full_name, created_at FROM src
 RETURNING id
)
UPDATE vehicle_link l SET customer_id = src.customer_id
FROM src
WHERE l.vehicle_id = src.vehicle_id AND l.workshop_id = src.workshop_id;

ALTER TABLE vehicle DROP COLUMN contact_name, DROP COLUMN contact_phone;

-- +goose Down
ALTER TABLE vehicle ADD COLUMN contact_name text, ADD COLUMN contact_phone text;
UPDATE vehicle v SET contact_name = c.full_name, contact_phone = c.phone
FROM vehicle_link l JOIN customer c ON c.id = l.customer_id
WHERE l.vehicle_id = v.id AND l.workshop_id = v.created_by_workshop_id;
DROP INDEX quote_customer_id_idx;
ALTER TABLE quote DROP CONSTRAINT quote_customer_fkey, DROP COLUMN customer_id;
DROP INDEX vehicle_link_customer_id_idx;
ALTER TABLE vehicle_link DROP CONSTRAINT vehicle_link_customer_fkey, DROP COLUMN customer_id;
DROP TABLE customer;
