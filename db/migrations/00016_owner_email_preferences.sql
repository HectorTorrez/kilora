-- +goose Up
ALTER TABLE app_user ADD COLUMN maintenance_emails_enabled boolean NOT NULL DEFAULT true;

-- +goose Down
ALTER TABLE app_user DROP COLUMN maintenance_emails_enabled;
