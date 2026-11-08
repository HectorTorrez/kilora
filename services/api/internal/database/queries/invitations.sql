-- name: LockLinkedVehicle :one
SELECT v.* FROM vehicle v JOIN vehicle_link l ON l.vehicle_id=v.id WHERE v.id=$1 AND l.workshop_id=$2 FOR UPDATE OF v;
-- name: RevokeVehicleInvitations :exec
UPDATE invitation SET revoked_at=now() WHERE vehicle_id=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now();
-- name: CreateInvitation :one
INSERT INTO invitation(vehicle_id,workshop_id,email,token_hash,expires_at,created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *;
-- name: ListInvitations :many
SELECT * FROM invitation WHERE vehicle_id=$1 AND workshop_id=$2 ORDER BY created_at DESC;
-- name: GetPendingInvitation :one
SELECT * FROM invitation WHERE token_hash=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now();
-- name: LockPendingInvitation :one
SELECT * FROM invitation WHERE token_hash=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now() FOR UPDATE;
-- name: AcceptInvitation :exec
UPDATE invitation SET accepted_at=now(), accepted_by=$2, consent_at=now() WHERE id=$1;
-- name: SetUnownedVehicleOwner :one
UPDATE vehicle SET owner_user_id=$2, status='vinculado' WHERE id=$1 AND owner_user_id IS NULL RETURNING *;
-- name: GetInvitationVehicle :one
SELECT * FROM vehicle WHERE id=$1;
-- name: ListOwnerWorkshops :many
SELECT w.* FROM workshop w JOIN vehicle_link l ON l.workshop_id=w.id JOIN vehicle v ON v.id=l.vehicle_id WHERE v.id=$1 AND v.owner_user_id=$2 ORDER BY w.name;
-- name: GetOwnerHistoryRecord :one
SELECT h.* FROM history_record h JOIN vehicle v ON v.id=h.vehicle_id WHERE h.id=$1 AND v.id=$2 AND v.owner_user_id=$3;
-- name: LockInvitationVehicle :one
SELECT * FROM vehicle WHERE id=$1 FOR UPDATE;
