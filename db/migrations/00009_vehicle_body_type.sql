-- +goose Up
-- Tipo de carrocería: define el modelo 3D y qué piezas existen (p. ej. cama de pickup).
-- Opcional: los vehículos existentes no tienen tipo hasta que alguien lo indique.
CREATE TYPE body_type AS ENUM ('sedan', 'hatchback', 'suv', 'pickup', 'van', 'camion');
ALTER TABLE vehicle ADD COLUMN body_type body_type;

-- +goose Down
ALTER TABLE vehicle DROP COLUMN body_type;
DROP TYPE body_type;
