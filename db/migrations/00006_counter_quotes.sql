-- +goose Up
ALTER TABLE quote ALTER COLUMN work_order_id DROP NOT NULL;

ALTER TABLE quote
  ADD COLUMN number int,
  ADD COLUMN branch_id uuid,
  ADD COLUMN customer_name text,
  ADD COLUMN customer_phone text,
  ADD COLUMN vehicle_id uuid,
  ADD COLUMN vehicle_make text,
  ADD COLUMN vehicle_model text,
  ADD COLUMN vehicle_year int,
  ADD COLUMN vehicle_plate text,
  ADD COLUMN notes text,
  ADD COLUMN valid_until date,
  ADD COLUMN converted_order_id uuid;

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY workshop_id ORDER BY created_at, id)::int AS n
  FROM quote
)
UPDATE quote AS q SET number = ranked.n FROM ranked WHERE q.id = ranked.id;

UPDATE quote AS q SET branch_id = o.branch_id
FROM work_order AS o
WHERE q.work_order_id = o.id AND q.branch_id IS NULL;

ALTER TABLE quote ALTER COLUMN number SET NOT NULL;
ALTER TABLE quote ALTER COLUMN branch_id SET NOT NULL;

ALTER TABLE quote ADD CONSTRAINT quote_workshop_number_key UNIQUE (workshop_id, number);
ALTER TABLE quote ADD CONSTRAINT quote_branch_workshop_fkey FOREIGN KEY (branch_id, workshop_id) REFERENCES branch (id, workshop_id);
ALTER TABLE quote ADD CONSTRAINT quote_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES vehicle (id);
ALTER TABLE quote ADD CONSTRAINT quote_converted_order_id_fkey FOREIGN KEY (converted_order_id) REFERENCES work_order (id);
ALTER TABLE quote ADD CONSTRAINT quote_vehicle_year_chk CHECK (vehicle_year IS NULL OR vehicle_year BETWEEN 1886 AND 2100);
ALTER TABLE quote ADD CONSTRAINT quote_vehicle_plate_chk CHECK (vehicle_plate IS NULL OR (vehicle_plate = upper(vehicle_plate) AND vehicle_plate !~ '[[:space:]-]'));
ALTER TABLE quote ADD CONSTRAINT quote_standalone_chk CHECK (
  work_order_id IS NOT NULL
  OR (
    customer_name IS NOT NULL AND btrim(customer_name) <> ''
    AND vehicle_model IS NOT NULL AND btrim(vehicle_model) <> ''
  )
);

CREATE INDEX quote_workshop_created_at_idx ON quote (workshop_id, created_at DESC);
CREATE INDEX quote_vehicle_id_idx ON quote (vehicle_id);
CREATE INDEX quote_converted_order_id_idx ON quote (converted_order_id);
CREATE INDEX quote_branch_workshop_idx ON quote (branch_id, workshop_id);

-- +goose Down
DELETE FROM quote WHERE work_order_id IS NULL;
ALTER TABLE quote DROP CONSTRAINT IF EXISTS quote_standalone_chk;
ALTER TABLE quote DROP CONSTRAINT IF EXISTS quote_vehicle_plate_chk;
ALTER TABLE quote DROP CONSTRAINT IF EXISTS quote_vehicle_year_chk;
ALTER TABLE quote DROP CONSTRAINT IF EXISTS quote_converted_order_id_fkey;
ALTER TABLE quote DROP CONSTRAINT IF EXISTS quote_vehicle_id_fkey;
ALTER TABLE quote DROP CONSTRAINT IF EXISTS quote_branch_workshop_fkey;
ALTER TABLE quote DROP CONSTRAINT IF EXISTS quote_workshop_number_key;
DROP INDEX IF EXISTS quote_branch_workshop_idx;
DROP INDEX IF EXISTS quote_converted_order_id_idx;
DROP INDEX IF EXISTS quote_vehicle_id_idx;
DROP INDEX IF EXISTS quote_workshop_created_at_idx;
ALTER TABLE quote
  DROP COLUMN IF EXISTS converted_order_id,
  DROP COLUMN IF EXISTS valid_until,
  DROP COLUMN IF EXISTS notes,
  DROP COLUMN IF EXISTS vehicle_plate,
  DROP COLUMN IF EXISTS vehicle_year,
  DROP COLUMN IF EXISTS vehicle_model,
  DROP COLUMN IF EXISTS vehicle_make,
  DROP COLUMN IF EXISTS vehicle_id,
  DROP COLUMN IF EXISTS customer_phone,
  DROP COLUMN IF EXISTS customer_name,
  DROP COLUMN IF EXISTS branch_id,
  DROP COLUMN IF EXISTS number;
ALTER TABLE quote ALTER COLUMN work_order_id SET NOT NULL;
