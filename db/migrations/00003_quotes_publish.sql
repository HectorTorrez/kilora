-- +goose Up
ALTER TABLE work_order ADD COLUMN public_notes text;
CREATE TYPE quote_outcome AS ENUM ('pendiente', 'acepto', 'rechazo', 'no_respondio');
CREATE TYPE quote_item_kind AS ENUM ('repuesto', 'mano_de_obra');
CREATE TABLE quote (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), work_order_id uuid NOT NULL UNIQUE REFERENCES work_order(id),
 workshop_id uuid NOT NULL REFERENCES workshop(id), total numeric(12,2) NOT NULL,
 currency char(3) NOT NULL DEFAULT 'USD', outcome quote_outcome NOT NULL DEFAULT 'pendiente',
 outcome_at timestamptz, outcome_by uuid REFERENCES app_user(id), share_token_hash text UNIQUE,
 shared_at timestamptz, share_expires_at timestamptz, created_by uuid NOT NULL REFERENCES app_user(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE quote_item (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quote_id uuid NOT NULL REFERENCES quote(id) ON DELETE CASCADE,
 position int NOT NULL, kind quote_item_kind NOT NULL, description text NOT NULL,
 quantity numeric(10,2) NOT NULL CHECK (quantity > 0), unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
 UNIQUE (quote_id, position)
);
CREATE TRIGGER quote_updated_at BEFORE UPDATE ON quote FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- +goose Down
DROP TABLE quote_item, quote;
DROP TYPE quote_item_kind, quote_outcome;
ALTER TABLE work_order DROP COLUMN public_notes;
