package httpserver

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"kilora/api/internal/auth"
	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/values"
)

const trackingValidity = 30 * 24 * time.Hour
const trackingNotFound = "Seguimiento no disponible"

func (s *server) getOrderTracking(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	w.Header().Set("Cache-Control", "no-store")
	o, err := s.findOrder(r.Context(), r, wc)
	if err != nil {
		return err
	}
	share, err := sqlc.New(s.db).GetActiveWorkOrderTrackingShare(r.Context(), o.ID)
	var active any
	if err == nil {
		active = map[string]any{"shared_at": share.SharedAt.Time, "expires_at": share.ExpiresAt.Time}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	writeJSON(w, http.StatusOK, map[string]any{"customer_update": o.CustomerUpdate, "estimated_ready_at": nullableTime(o.EstimatedReadyAt), "updated_at": o.TrackingUpdatedAt.Time, "share": active})
	return nil
}

// Customer messages and share access can still change after repair work closes;
// neither operation edits the published service history.
func (s *server) withTrackingOrder(r *http.Request, wc workshopAccess, action string, fn func(*sqlc.Queries, sqlc.WorkOrder) error) error {
	id, err := pathID(r, "orderID", orderNotFound)
	if err != nil {
		return err
	}
	return s.mutate(r.Context(), func(q *sqlc.Queries) (auditEvent, error) {
		o, err := q.LockWorkOrder(r.Context(), sqlc.LockWorkOrderParams{ID: id, WorkshopID: wc.workshopID})
		if err != nil {
			return auditEvent{}, notFoundIfMissing(err, orderNotFound)
		}
		if !wc.canReadBranch(o.BranchID) {
			return auditEvent{}, notFound(orderNotFound)
		}
		if err = wc.requireBranchWriter(o.BranchID); err != nil {
			return auditEvent{}, err
		}
		if err = fn(q, o); err != nil {
			return auditEvent{}, err
		}
		return wc.event("work_order", o.ID, action), nil
	})
}

func (s *server) updateOrderTracking(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	var in struct {
		CustomerUpdate   json.RawMessage `json:"customer_update"`
		EstimatedReadyAt json.RawMessage `json:"estimated_ready_at"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	if len(in.CustomerUpdate) == 0 || len(in.EstimatedReadyAt) == 0 {
		return badRequest("Indicá el mensaje y la fecha estimada; usá null para quitarlos")
	}
	var message, estimate *string
	if json.Unmarshal(in.CustomerUpdate, &message) != nil || json.Unmarshal(in.EstimatedReadyAt, &estimate) != nil {
		return badRequest("Datos de seguimiento inválidos")
	}
	message = values.OptionalText(message)
	if message != nil && utf8.RuneCountInString(*message) > 1000 {
		return badRequest("El mensaje admite hasta 1000 caracteres")
	}
	var eta pgtype.Timestamptz
	if estimate != nil {
		parsed, err := time.Parse(time.RFC3339, *estimate)
		if err != nil {
			return badRequest("Fecha estimada inválida; incluí fecha, hora y zona horaria")
		}
		eta = timestamptz(parsed)
	}
	err := s.withTrackingOrder(r, wc, "work_order.tracking_updated", func(q *sqlc.Queries, o sqlc.WorkOrder) error {
		if eta.Valid && (isClosed(o.Status) || eta.Time.Before(o.ReceivedAt.Time)) {
			return badRequest("La fecha estimada debe ser posterior al ingreso y la orden debe estar abierta")
		}
		return q.UpdateWorkOrderTracking(r.Context(), sqlc.UpdateWorkOrderTrackingParams{ID: o.ID, WorkshopID: o.WorkshopID, CustomerUpdate: message, EstimatedReadyAt: eta})
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *server) shareOrderTracking(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	w.Header().Set("Cache-Control", "no-store")
	token, hash, err := auth.NewTokenPair()
	if err != nil {
		return err
	}
	var response map[string]any
	err = s.withTrackingOrder(r, wc, "work_order.tracking_shared", func(q *sqlc.Queries, o sqlc.WorkOrder) error {
		share, err := q.ShareWorkOrderTracking(r.Context(), sqlc.ShareWorkOrderTrackingParams{WorkOrderID: o.ID, TokenHash: hash, ExpiresAt: timestamptz(time.Now().Add(trackingValidity)), CreatedBy: wc.userID})
		if err != nil {
			return err
		}
		workshop, err := q.GetWorkshop(r.Context(), o.WorkshopID)
		if err != nil {
			return err
		}
		var phone *string
		customer, err := q.GetVehicleCustomer(r.Context(), sqlc.GetVehicleCustomerParams{VehicleID: o.VehicleID, WorkshopID: o.WorkshopID})
		if err == nil {
			phone = customer.Phone
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		link := s.webURL("/estado/" + token)
		text := fmt.Sprintf("Consultá el estado de tu reparación en %s, orden #%d: %s", workshop.Name, o.Number, link)
		response = map[string]any{"url": link, "whatsapp_url": whatsAppURL(phone, text), "shared_at": share.SharedAt.Time, "expires_at": share.ExpiresAt.Time}
		return nil
	})
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, response)
	return nil
}

func (s *server) revokeOrderTracking(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	err := s.withTrackingOrder(r, wc, "work_order.tracking_revoked", func(q *sqlc.Queries, o sqlc.WorkOrder) error { return q.RevokeWorkOrderTracking(r.Context(), o.ID) })
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *server) publicOrderTracking(w http.ResponseWriter, r *http.Request) error {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Robots-Tag", "noindex, nofollow, noarchive")
	w.Header().Set("Referrer-Policy", "no-referrer")
	if err := s.limitPublicRead(r, "order-tracking"); err != nil {
		return err
	}
	token := pathToken(r)
	if len(token) != 43 {
		return notFound(trackingNotFound)
	}
	o, err := sqlc.New(s.db).GetPublicWorkOrderTracking(r.Context(), auth.HashToken(token))
	if err != nil {
		return notFoundIfMissing(err, trackingNotFound)
	}
	eta := nullableTime(o.EstimatedReadyAt)
	if isClosed(o.Status) {
		eta = nil
	}
	// This allowlist is independent of the workshop order DTO and service history.
	writeJSON(w, http.StatusOK, map[string]any{
		"number": o.Number, "status": o.Status, "customer_update": o.CustomerUpdate,
		"estimated_ready_at": eta, "updated_at": o.TrackingUpdatedAt.Time,
		"received_at": o.ReceivedAt.Time, "completed_at": nullableTime(o.CompletedAt), "cancelled_at": nullableTime(o.CancelledAt),
		"workshop_name": o.WorkshopName, "branch_name": o.BranchName,
		"vehicle": map[string]any{"make": o.Make, "model": o.Model, "year": o.Year}, "expires_at": o.ExpiresAt.Time,
	})
	return nil
}
