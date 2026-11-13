-- +goose Up
UPDATE app_user SET maintenance_emails_enabled = false
WHERE lower(btrim(email::text)) LIKE '%@demo.kilora.app';

UPDATE owner_vehicle_maintenance SET email_reminders = false
WHERE vehicle_id IN (
    SELECT v.id FROM vehicle v JOIN app_user u ON u.id = v.owner_user_id
    WHERE lower(btrim(u.email::text)) LIKE '%@demo.kilora.app'
);

-- +goose Down
-- Keep demo recipients opted out when rolling back this data correction.
SELECT 1;
