package httpserver

import (
	"errors"
	"fmt"
	"net/http"
	"net/mail"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"kilora/api/internal/auth"
	"kilora/api/internal/database"
	"kilora/api/internal/database/sqlc"
)

var errOwned = errors.New("owned")
var errEmail = errors.New("email")

func (s *server) createInvitation(w http.ResponseWriter, r *http.Request) {
	wc, _ := CurrentWorkshop(r.Context())
	if !writeAllowed(w, wc) {
		return
	}
	id, e := uuid.Parse(chi.URLParam(r, "vehicleID"))
	if e != nil {
		fail(w, 404, "Vehículo no encontrado")
		return
	}
	var in struct {
		Email string `json:"email"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Email = strings.TrimSpace(in.Email)
	addr, e := mail.ParseAddress(in.Email)
	if e != nil || addr.Address != in.Email {
		fail(w, 400, "Correo inválido")
		return
	}
	token, e := auth.NewToken()
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	ctx := r.Context()
	var inv sqlc.Invitation
	var v sqlc.Vehicle
	var workshop sqlc.Workshop
	e = database.WithTx(ctx, s.db, func(q *sqlc.Queries) error {
		var err error
		v, err = q.LockLinkedVehicle(ctx, sqlc.LockLinkedVehicleParams{ID: dbUUID(id), WorkshopID: dbUUID(wc.WorkshopID)})
		if err != nil {
			return err
		}
		if v.OwnerUserID.Valid {
			return errOwned
		}
		if err = q.RevokeVehicleInvitations(ctx, v.ID); err != nil {
			return err
		}
		inv, err = q.CreateInvitation(ctx, sqlc.CreateInvitationParams{VehicleID: v.ID, WorkshopID: dbUUID(wc.WorkshopID), Email: in.Email, TokenHash: auth.HashToken(token), ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(14 * 24 * time.Hour), Valid: true}, CreatedBy: dbUUID(wc.UserID)})
		if err != nil {
			return err
		}
		workshop, err = q.GetWorkshop(ctx, dbUUID(wc.WorkshopID))
		if err != nil {
			return err
		}
		_, err = q.InsertAuditEvent(ctx, sqlc.InsertAuditEventParams{ActorUserID: dbUUID(wc.UserID), WorkshopID: dbUUID(wc.WorkshopID), Entity: "invitation", EntityID: inv.ID, Action: "invitation.create"})
		return err
	})
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404, "Vehículo no encontrado")
		return
	}
	if errors.Is(e, errOwned) {
		fail(w, 409, "El vehículo ya tiene propietario")
		return
	}
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	link := strings.TrimRight(s.origin, "/") + "/invitacion/" + token
	if e = s.mailer.Send(ctx, in.Email, "Invitación a Kilora", fmt.Sprintf("%s te invita a vincular tu vehículo: %s", workshop.Name, link)); e != nil {
		s.logger.Error("enviar invitación", "error", e)
		fail(w, 500, "No se pudo enviar la invitación")
		return
	}
	plate := "vehículo"
	if v.Plate != nil {
		plate = *v.Plate
	}
	phone := ""
	if v.ContactPhone != nil {
		phone = strings.TrimPrefix(*v.ContactPhone, "+")
	}
	text := fmt.Sprintf("%s te invita a vincular el vehículo %s: %s", workshop.Name, plate, link)
	writeJSON(w, 201, map[string]any{"id": uuid.UUID(inv.ID.Bytes), "url": link, "whatsapp_url": "https://wa.me/" + phone + "?text=" + url.QueryEscape(text), "expires_at": inv.ExpiresAt.Time})
}
func (s *server) listInvitations(w http.ResponseWriter, r *http.Request) {
	wc, _ := CurrentWorkshop(r.Context())
	id, e := uuid.Parse(chi.URLParam(r, "vehicleID"))
	if e != nil {
		fail(w, 404, "Vehículo no encontrado")
		return
	}
	q := sqlc.New(s.db)
	_, e = q.GetVehicle(r.Context(), sqlc.GetVehicleParams{ID: dbUUID(id), WorkshopID: dbUUID(wc.WorkshopID)})
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404, "Vehículo no encontrado")
		return
	}
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	rows, e := q.ListInvitations(r.Context(), sqlc.ListInvitationsParams{VehicleID: dbUUID(id), WorkshopID: dbUUID(wc.WorkshopID)})
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	out := []map[string]any{}
	for _, i := range rows {
		state := "pendiente"
		if i.AcceptedAt.Valid {
			state = "aceptada"
		} else if i.RevokedAt.Valid {
			state = "revocada"
		} else if !i.ExpiresAt.Time.After(time.Now()) {
			state = "expirada"
		}
		out = append(out, map[string]any{"id": uuid.UUID(i.ID.Bytes), "email": i.Email, "status": state, "created_at": i.CreatedAt.Time, "expires_at": i.ExpiresAt.Time})
	}
	writeJSON(w, 200, out)
}
func (s *server) publicInvitation(w http.ResponseWriter, r *http.Request) {
	if !s.limiter.allowLimit("invitation:"+clientIP(r), 60) {
		fail(w, 429, "Demasiadas solicitudes")
		return
	}
	q := sqlc.New(s.db)
	ctx := r.Context()
	i, e := q.GetPendingInvitation(ctx, auth.HashToken(chi.URLParam(r, "token")))
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404, "Invitación no disponible")
		return
	}
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	v, e := q.GetInvitationVehicle(ctx, i.VehicleID)
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	workshop, e := q.GetWorkshop(ctx, i.WorkshopID)
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	parts := strings.SplitN(i.Email, "@", 2)
	hint := "***"
	if len(parts) == 2 && len([]rune(parts[0])) > 0 {
		hint = string([]rune(parts[0])[0]) + "***@" + parts[1]
	}
	writeJSON(w, 200, map[string]any{"workshop_name": workshop.Name, "workshop_verified_at": workshop.VerifiedAt, "vehicle": map[string]any{"plate": v.Plate, "make": v.Make, "model": v.Model, "year": v.Year}, "email_hint": hint, "expires_at": i.ExpiresAt.Time})
}
func (s *server) acceptInvitation(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Consent bool `json:"consent"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !in.Consent {
		fail(w, 400, "El consentimiento es obligatorio")
		return
	}
	ctx := r.Context()
	uid := currentUser(ctx).ID
	var v sqlc.Vehicle
	e := database.WithTx(ctx, s.db, func(q *sqlc.Queries) error {
		hash := auth.HashToken(chi.URLParam(r, "token"))
		i, err := q.GetPendingInvitation(ctx, hash)
		if err != nil {
			return err
		}
		if _, err = q.LockInvitationVehicle(ctx, i.VehicleID); err != nil {
			return err
		}
		i, err = q.LockPendingInvitation(ctx, hash)
		if err != nil {
			return err
		}
		u, err := q.GetUserByID(ctx, dbUUID(uid))
		if err != nil {
			return err
		}
		if !strings.EqualFold(u.Email, i.Email) {
			return errEmail
		}
		v, err = q.SetUnownedVehicleOwner(ctx, sqlc.SetUnownedVehicleOwnerParams{ID: i.VehicleID, OwnerUserID: dbUUID(uid)})
		if errors.Is(err, pgx.ErrNoRows) {
			return errOwned
		}
		if err != nil {
			return err
		}
		if err = q.AcceptInvitation(ctx, sqlc.AcceptInvitationParams{ID: i.ID, AcceptedBy: dbUUID(uid)}); err != nil {
			return err
		}
		_, err = q.InsertAuditEvent(ctx, sqlc.InsertAuditEventParams{ActorUserID: dbUUID(uid), WorkshopID: i.WorkshopID, Entity: "invitation", EntityID: i.ID, Action: "invitation.accept"})
		return err
	})
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404, "Invitación no disponible")
		return
	}
	if errors.Is(e, errEmail) {
		fail(w, 403, "Esta invitación es para otro correo")
		return
	}
	if errors.Is(e, errOwned) {
		fail(w, 409, "El vehículo ya tiene propietario")
		return
	}
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	writeJSON(w, 200, vehicleDTO(v, nil))
}
