-- name: GetOwnerMaintenance :one
SELECT coalesce(p.email_reminders, false)::boolean AS email_reminders,
       coalesce(p.intervals, '{}'::jsonb)::jsonb AS intervals,
       p.last_sent_at
FROM vehicle v LEFT JOIN owner_vehicle_maintenance p ON p.vehicle_id = v.id
WHERE v.id = sqlc.arg(vehicle_id) AND v.owner_user_id = sqlc.arg(owner_user_id);

-- name: SetOwnerMaintenanceEmail :exec
INSERT INTO owner_vehicle_maintenance (vehicle_id, email_reminders)
VALUES ($1, $2) ON CONFLICT (vehicle_id) DO UPDATE SET email_reminders = excluded.email_reminders;

-- name: SetOwnerMaintenanceInterval :exec
INSERT INTO owner_vehicle_maintenance (vehicle_id, intervals)
VALUES (sqlc.arg(vehicle_id), jsonb_build_object(sqlc.arg(category)::text, sqlc.arg(interval)::jsonb))
ON CONFLICT (vehicle_id) DO UPDATE SET intervals = owner_vehicle_maintenance.intervals || excluded.intervals;

-- name: ResetOwnerMaintenanceInterval :exec
UPDATE owner_vehicle_maintenance SET intervals = intervals - sqlc.arg(category)::text WHERE vehicle_id = sqlc.arg(vehicle_id);

-- name: ListMaintenanceReminderVehicles :many
SELECT p.vehicle_id FROM owner_vehicle_maintenance p
JOIN vehicle v ON v.id = p.vehicle_id
JOIN app_user u ON u.id = v.owner_user_id
WHERE p.email_reminders AND u.maintenance_emails_enabled AND lower(btrim(u.email::text)) NOT LIKE '%@demo.kilora.app' AND u.email_verified_at IS NOT NULL AND v.status = 'vinculado'
AND (p.last_sent_at IS NULL OR p.last_sent_at <= sqlc.arg(before)::timestamptz)
ORDER BY p.last_sent_at NULLS FIRST, p.vehicle_id;

-- name: LockMaintenanceReminder :one
SELECT p.*, v.owner_user_id, u.email::text AS email, v.make, v.model
FROM owner_vehicle_maintenance p JOIN vehicle v ON v.id = p.vehicle_id
JOIN app_user u ON u.id = v.owner_user_id
WHERE p.vehicle_id = sqlc.arg(vehicle_id) AND p.email_reminders
AND v.status = 'vinculado' AND u.maintenance_emails_enabled AND lower(btrim(u.email::text)) NOT LIKE '%@demo.kilora.app' AND u.email_verified_at IS NOT NULL
FOR UPDATE OF p, v, u SKIP LOCKED;

-- name: MarkMaintenanceReminderSent :exec
UPDATE owner_vehicle_maintenance SET last_sent_at = sqlc.arg(sent_at) WHERE vehicle_id = sqlc.arg(vehicle_id);
