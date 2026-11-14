-- +goose Up
-- Plantillas de cotización del taller: ítems reutilizables. Copiar una
-- plantilla a una cotización duplica los ítems; editarla después no cambia
-- las cotizaciones ya hechas.
CREATE TABLE quote_template (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workshop_id uuid NOT NULL REFERENCES workshop(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    created_by uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX quote_template_name_key ON quote_template (workshop_id, lower(name));

CREATE TABLE quote_template_item (
    template_id uuid NOT NULL REFERENCES quote_template(id) ON DELETE CASCADE,
    position int NOT NULL,
    kind quote_item_kind NOT NULL,
    description text NOT NULL,
    quantity numeric(10,2) NOT NULL CHECK (quantity > 0),
    unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
    part text CHECK (part ~ '^[a-z_]+$'),
    brand text CHECK (char_length(brand) <= 100),
    PRIMARY KEY (template_id, position)
);

CREATE TRIGGER quote_template_updated_at BEFORE UPDATE ON quote_template FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +goose Down
DROP TABLE quote_template_item, quote_template;
