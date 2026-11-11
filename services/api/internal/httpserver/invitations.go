package httpserver

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"kilora/api/internal/auth"
	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/values"
)

const (
	invitationTTL         = 14 * 24 * time.Hour
	invitationUnavailable = "Invitación no disponible"
	vehicleAlreadyOwned   = "El vehículo ya tiene propietario"
)

var errVehicleOwned = conflict(vehicleAlreadyOwned)

func invitationStatus(i sqlc.Invitation) string {
	switch {
	case i.AcceptedAt.Valid:
		return "aceptada"
	case i.RevokedAt.Valid:
		return "revocada"
	case !i.ExpiresAt.Time.After(time.Now()):
		return "expirada"
	}
	return "pendiente"
}

func (s *server) createInvitation(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	if err := wc.requireWriter(); err != nil {
		return err
	}
	id, err := pathID(r, "vehicleID", vehicleNotFound)
	if err != nil {
		return err
	}
	var in struct {
		Email string `json:"email"`
	}
	if err = decode(r, &in); err != nil {
		return err
	}
	email, ok := values.Email(in.Email)
	if !ok {
		return badRequest("Correo inválido")
	}
	token, hash, err := auth.NewTokenPair()
	if err != nil {
		return err
	}
	ctx := r.Context()
	var inv sqlc.Invitation
	var v sqlc.Vehicle
	var workshop sqlc.Workshop
	var customer *sqlc.Customer
	err = s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		var err error
		v, err = q.LockLinkedVehicle(ctx, sqlc.LockLinkedVehicleParams{ID: id, WorkshopID: wc.workshopID})
		if err != nil {
			return auditEvent{}, notFoundIfMissing(err, vehicleNotFound)
		}
		if v.OwnerUserID != nil {
			return auditEvent{}, errVehicleOwned
		}
		if err = q.RevokeVehicleInvitations(ctx, v.ID); err != nil {
			return auditEvent{}, err
		}
		inv, err = q.CreateInvitation(ctx, sqlc.CreateInvitationParams{VehicleID: v.ID, WorkshopID: wc.workshopID, Email: email, TokenHash: hash, ExpiresAt: timestamptz(time.Now().Add(invitationTTL)), CreatedBy: wc.userID})
		if err != nil {
			return auditEvent{}, err
		}
		if workshop, err = q.GetWorkshop(ctx, wc.workshopID); err != nil {
			return auditEvent{}, err
		}
		if customer, err = vehicleCustomer(ctx, q, v.ID, wc.workshopID); err != nil {
			return auditEvent{}, err
		}
		return wc.event("invitation", inv.ID, "invitation.create"), nil
	})
	if err != nil {
		return err
	}
	link := s.webURL("/invitacion/" + token)
	if err = s.mailer.Send(ctx, email, "Invitación a Kilora", fmt.Sprintf("%s te invita a vincular tu vehículo: %s", workshop.Name, link)); err != nil {
		s.logger.Error("enviar invitación", "error", err)
		return httpError{http.StatusInternalServerError, "No se pudo enviar la invitación"}
	}
	plate := "vehículo"
	if v.Plate != nil {
		plate = *v.Plate
	}
	text := fmt.Sprintf("%s te invita a vincular el vehículo %s: %s", workshop.Name, plate, link)
	var phone *string
	if customer != nil {
		phone = customer.Phone
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": inv.ID, "url": link, "whatsapp_url": whatsAppURL(phone, text), "expires_at": inv.ExpiresAt.Time})
	return nil
}

func (s *server) listInvitations(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	id, err := pathID(r, "vehicleID", vehicleNotFound)
	if err != nil {
		return err
	}
	ctx := r.Context()
	q := sqlc.New(s.db)
	if err = requireLinkedVehicle(ctx, q, wc, &id); err != nil {
		return err
	}
	rows, err := q.ListInvitations(ctx, sqlc.ListInvitationsParams{VehicleID: id, WorkshopID: wc.workshopID})
	if err != nil {
		return err
	}
	out := []map[string]any{}
	for _, i := range rows {
		out = append(out, map[string]any{"id": i.ID, "email": i.Email, "status": invitationStatus(i), "created_at": i.CreatedAt.Time, "expires_at": i.ExpiresAt.Time})
	}
	writeJSON(w, http.StatusOK, out)
	return nil
}

func emailHint(email string) string {
	parts := strings.SplitN(email, "@", 2)
	if len(parts) == 2 && len([]rune(parts[0])) > 0 {
		return string([]rune(parts[0])[0]) + "***@" + parts[1]
	}
	return "***"
}

func (s *server) publicInvitation(w http.ResponseWriter, r *http.Request) error {
	if err := s.limitPublicRead(r, "invitation"); err != nil {
		return err
	}
	ctx := r.Context()
	q := sqlc.New(s.db)
	i, err := q.GetPendingInvitation(ctx, auth.HashToken(pathToken(r)))
	if err != nil {
		return notFoundIfMissing(err, invitationUnavailable)
	}
	v, err := q.GetInvitationVehicle(ctx, i.VehicleID)
	if err != nil {
		return err
	}
	workshop, err := q.GetWorkshop(ctx, i.WorkshopID)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, map[string]any{"workshop_name": workshop.Name, "workshop_verified_at": nullableTime(workshop.VerifiedAt), "vehicle": map[string]any{"plate": v.Plate, "make": v.Make, "model": v.Model, "year": v.Year}, "email_hint": emailHint(i.Email), "expires_at": i.ExpiresAt.Time})
	return nil
}

func (s *server) acceptInvitation(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Consent bool `json:"consent"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	if !in.Consent {
		return badRequest("El consentimiento es obligatorio")
	}
	ctx := r.Context()
	user := currentUser(ctx).ID
	hash := auth.HashToken(pathToken(r))
	var v sqlc.Vehicle
	err := s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		i, err := q.GetPendingInvitation(ctx, hash)
		if err != nil {
			return auditEvent{}, err
		}
		// Vehicle before invitation: createInvitation takes the same locks in this order.
		if _, err = q.LockInvitationVehicle(ctx, i.VehicleID); err != nil {
			return auditEvent{}, err
		}
		if i, err = q.LockPendingInvitation(ctx, hash); err != nil {
			return auditEvent{}, err
		}
		u, err := q.GetUserByID(ctx, user)
		if err != nil {
			return auditEvent{}, err
		}
		if !strings.EqualFold(u.Email, i.Email) {
			return auditEvent{}, forbidden("Esta invitación es para otro correo")
		}
		v, err = q.SetUnownedVehicleOwner(ctx, sqlc.SetUnownedVehicleOwnerParams{ID: i.VehicleID, OwnerUserID: &user})
		if errors.Is(err, pgx.ErrNoRows) {
			return auditEvent{}, errVehicleOwned
		}
		if err != nil {
			return auditEvent{}, err
		}
		if err = q.AcceptInvitation(ctx, sqlc.AcceptInvitationParams{ID: i.ID, AcceptedBy: &user}); err != nil {
			return auditEvent{}, err
		}
		if err = q.LinkVehicleCustomerUser(ctx, sqlc.LinkVehicleCustomerUserParams{UserID: &user, VehicleID: i.VehicleID, WorkshopID: i.WorkshopID}); err != nil {
			return auditEvent{}, err
		}
		return auditEvent{actor: user, workshop: &i.WorkshopID, entity: "invitation", id: i.ID, action: "invitation.accept"}, nil
	})
	if err != nil {
		return notFoundIfMissing(err, invitationUnavailable)
	}
	writeJSON(w, http.StatusOK, vehicleDTO(v, nil, nil))
	return nil
}
