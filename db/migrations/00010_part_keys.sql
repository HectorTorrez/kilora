-- +goose Up
-- Pieza concreta del catálogo (pastillas_delanteras, bateria…). La lista vive
-- en la API; aquí solo se exige el formato de clave.
ALTER TABLE job ADD COLUMN part text CHECK (part ~ '^[a-z_]+$');
ALTER TABLE quote_item ADD COLUMN part text CHECK (part ~ '^[a-z_]+$');
-- +goose Down
ALTER TABLE quote_item DROP COLUMN part;
ALTER TABLE job DROP COLUMN part;
