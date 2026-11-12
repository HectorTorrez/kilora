-- +goose Up
-- Más zonas del vehículo para el mapa 3D del propietario.
ALTER TYPE part_category ADD VALUE IF NOT EXISTS 'motor' BEFORE 'otro';
ALTER TYPE part_category ADD VALUE IF NOT EXISTS 'transmision' BEFORE 'otro';
ALTER TYPE part_category ADD VALUE IF NOT EXISTS 'refrigeracion' BEFORE 'otro';
ALTER TYPE part_category ADD VALUE IF NOT EXISTS 'electrico' BEFORE 'otro';
ALTER TYPE part_category ADD VALUE IF NOT EXISTS 'aire_acondicionado' BEFORE 'otro';
ALTER TYPE part_category ADD VALUE IF NOT EXISTS 'direccion' BEFORE 'otro';
ALTER TYPE part_category ADD VALUE IF NOT EXISTS 'escape' BEFORE 'otro';
ALTER TYPE part_category ADD VALUE IF NOT EXISTS 'carroceria' BEFORE 'otro';

-- +goose Down
-- Postgres no permite quitar valores de un enum: se recrea el tipo y las
-- categorías nuevas pasan a 'otro'. Los snapshots del historial (jsonb) no cambian.
ALTER TYPE part_category RENAME TO part_category_old;
CREATE TYPE part_category AS ENUM ('aceite', 'frenos', 'amortiguadores', 'bateria', 'llantas', 'otro');
ALTER TABLE job ALTER COLUMN category TYPE part_category USING (
 CASE WHEN category::text IN ('aceite', 'frenos', 'amortiguadores', 'bateria', 'llantas') THEN category::text ELSE 'otro' END
)::part_category;
ALTER TABLE recommendation ALTER COLUMN category TYPE part_category USING (
 CASE WHEN category::text IN ('aceite', 'frenos', 'amortiguadores', 'bateria', 'llantas') THEN category::text ELSE 'otro' END
)::part_category;
DROP TYPE part_category_old;
