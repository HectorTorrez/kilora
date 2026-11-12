-- +goose Up
ALTER TABLE quote_item ADD COLUMN brand text CHECK (char_length(brand) <= 100);

-- +goose Down
ALTER TABLE quote_item DROP COLUMN brand;
