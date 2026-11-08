package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	decimalpkg "github.com/shopspring/decimal"
	"kilora/api/internal/database"
	"kilora/api/internal/database/sqlc"
)

func orderDTO(o sqlc.WorkOrder) map[string]any {
	var completed, cancelled any
	if o.CompletedAt.Valid {
		completed = o.CompletedAt.Time
	}
	if o.CancelledAt.Valid {
		cancelled = o.CancelledAt.Time
	}
	return map[string]any{"id": uuid.UUID(o.ID.Bytes), "workshop_id": uuid.UUID(o.WorkshopID.Bytes), "branch_id": uuid.UUID(o.BranchID.Bytes), "vehicle_id": uuid.UUID(o.VehicleID.Bytes), "number": o.Number, "status": o.Status, "reason": o.Reason, "odometer_km": o.OdometerKm, "internal_notes": o.InternalNotes, "public_notes": o.PublicNotes, "received_at": o.ReceivedAt.Time, "completed_at": completed, "cancelled_at": cancelled, "cancel_reason": o.CancelReason, "created_by": uuid.UUID(o.CreatedBy.Bytes)}
}
func branchAllowed(wc WorkshopContext, id uuid.UUID) bool {
	if wc.Role == "admin" {
		return true
	}
	for _, b := range wc.WriteBranchIDs {
		if b == id {
			return true
		}
	}
	return false
}
func audit(ctx context.Context, q *sqlc.Queries, wc WorkshopContext, id pgtype.UUID, entity, action string) error {
	_, err := q.InsertAuditEvent(ctx, sqlc.InsertAuditEventParams{ActorUserID: dbUUID(wc.UserID), WorkshopID: dbUUID(wc.WorkshopID), Entity: entity, EntityID: id, Action: action})
	return err
}
func (s *server) createOrder(w http.ResponseWriter, r *http.Request) {
	wc, _ := CurrentWorkshop(r.Context())
	if !writeAllowed(w, wc) {
		return
	}
	var in struct {
		VehicleID     uuid.UUID `json:"vehicle_id"`
		BranchID      uuid.UUID `json:"branch_id"`
		Reason        string    `json:"reason"`
		OdometerKm    *int32    `json:"odometer_km"`
		InternalNotes *string   `json:"internal_notes"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Reason = strings.TrimSpace(in.Reason)
	if in.VehicleID == uuid.Nil || in.BranchID == uuid.Nil || in.Reason == "" || (in.OdometerKm != nil && *in.OdometerKm < 0) {
		fail(w, 400, "Datos de orden inválidos")
		return
	}
	if !branchAllowed(wc, in.BranchID) {
		fail(w, 403, "Acceso denegado")
		return
	}
	q := sqlc.New(s.db)
	if _, err := q.GetBranch(r.Context(), sqlc.GetBranchParams{ID: dbUUID(in.BranchID), WorkshopID: dbUUID(wc.WorkshopID)}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			fail(w, 404, "Sucursal no encontrada")
		} else {
			fail(w, 500, "Error interno")
		}
		return
	}
	var o sqlc.WorkOrder
	var err error
	for i := 0; i < 3; i++ {
		err = database.WithTx(r.Context(), s.db, func(q *sqlc.Queries) error {
			n, e := q.NextWorkOrderNumber(r.Context(), dbUUID(wc.WorkshopID))
			if e != nil {
				return e
			}
			o, e = q.CreateWorkOrder(r.Context(), sqlc.CreateWorkOrderParams{WorkshopID: dbUUID(wc.WorkshopID), BranchID: dbUUID(in.BranchID), VehicleID: dbUUID(in.VehicleID), Number: n, Reason: in.Reason, OdometerKm: in.OdometerKm, InternalNotes: in.InternalNotes, CreatedBy: dbUUID(wc.UserID)})
			if e != nil {
				return e
			}
			if in.OdometerKm != nil {
				_, e = q.CreateOdometerReading(r.Context(), sqlc.CreateOdometerReadingParams{VehicleID: o.VehicleID, Km: *in.OdometerKm, ReadAt: pgtype.Timestamptz{Time: time.Now(), Valid: true}, Source: sqlc.OdometerSourceOrden, WorkOrderID: o.ID, RecordedBy: dbUUID(wc.UserID)})
				if e != nil {
					return e
				}
			}
			if _, e = q.TouchVehicleActivity(r.Context(), sqlc.TouchVehicleActivityParams{VehicleID: o.VehicleID, WorkshopID: o.WorkshopID}); e != nil {
				return e
			}
			return audit(r.Context(), q, wc, o.ID, "work_order", "work_order.create")
		})
		var pe *pgconn.PgError
		if !errors.As(err, &pe) || pe.Code != "23505" {
			break
		}
	}
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 404, "Vehículo no encontrado")
		return
	}
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	writeJSON(w, 201, orderDTO(o))
}
func (s *server) findOrder(w http.ResponseWriter, r *http.Request) (sqlc.WorkOrder, WorkshopContext, bool) {
	wc, _ := CurrentWorkshop(r.Context())
	id, e := uuid.Parse(chi.URLParam(r, "orderID"))
	if e != nil {
		fail(w, 404, "Orden no encontrada")
		return sqlc.WorkOrder{}, wc, false
	}
	var o sqlc.WorkOrder
	if q, ok := r.Context().Value(jobTxKey{}).(*sqlc.Queries); ok {
		o, e = q.LockWorkOrder(r.Context(), sqlc.LockWorkOrderParams{ID: dbUUID(id), WorkshopID: dbUUID(wc.WorkshopID)})
	} else {
		o, e = sqlc.New(s.db).GetWorkOrder(r.Context(), sqlc.GetWorkOrderParams{ID: dbUUID(id), WorkshopID: dbUUID(wc.WorkshopID)})
	}
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404, "Orden no encontrada")
		return o, wc, false
	}
	if e != nil {
		fail(w, 500, "Error interno")
		return o, wc, false
	}
	return o, wc, true
}
func (s *server) getOrder(w http.ResponseWriter, r *http.Request) {
	o, wc, ok := s.findOrder(w, r)
	if !ok {
		return
	}
	q := sqlc.New(s.db)
	jobs, err := q.ListJobsByWorkOrder(r.Context(), sqlc.ListJobsByWorkOrderParams{WorkOrderID: o.ID, WorkshopID: dbUUID(wc.WorkshopID)})
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	parts, err := q.ListPartsByWorkOrder(r.Context(), sqlc.ListPartsByWorkOrderParams{WorkOrderID: o.ID, WorkshopID: dbUUID(wc.WorkshopID)})
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	out := orderDTO(o)
	js := []any{}
	for _, j := range jobs {
		ps := []any{}
		for _, p := range parts {
			if p.JobID == j.ID {
				ps = append(ps, partDTO(p))
			}
		}
		item := jobDTO(j)
		item["parts"] = ps
		js = append(js, item)
	}
	out["jobs"] = js
	quoteID, qe := q.GetQuoteIDByOrder(r.Context(), sqlc.GetQuoteIDByOrderParams{WorkOrderID: o.ID, WorkshopID: o.WorkshopID})
	if qe == nil {
		quote, e := s.quoteData(r, quoteID)
		if e != nil {
			fail(w, 500, "Error interno")
			return
		}
		out["quote"] = quote
		charged, e := q.GetHistoryTotalByWorkOrder(r.Context(), o.ID)
		if e == nil {
			quoted, _ := decimalpkg.NewFromString(quote["total"].(string))
			actual, _ := decimalpkg.NewFromString(charged)
			out["quote_comparison"] = map[string]any{"quote_total": quote["total"], "charged_total": charged, "difference": actual.Sub(quoted).StringFixed(2)}
		} else if !errors.Is(e, pgx.ErrNoRows) {
			fail(w, 500, "Error interno")
			return
		}
	} else if !errors.Is(qe, pgx.ErrNoRows) {
		fail(w, 500, "Error interno")
		return
	}

	if id, e := q.GetHistoryIDByOrder(r.Context(), o.ID); e == nil {
		out["history_record_id"] = uuid.UUID(id.Bytes)
	} else if !errors.Is(e, pgx.ErrNoRows) {
		fail(w, 500, "Error interno")
		return
	}
	writeJSON(w, 200, out)
}
func (s *server) listOrders(w http.ResponseWriter, r *http.Request) {
	wc, _ := CurrentWorkshop(r.Context())
	var status *sqlc.WorkOrderStatus
	if v := r.URL.Query().Get("status"); v != "" {
		if !validStatus(v) {
			fail(w, 400, "Estado inválido")
			return
		}
		x := sqlc.WorkOrderStatus(v)
		status = &x
	}
	var branch pgtype.UUID
	if v := r.URL.Query().Get("branch_id"); v != "" {
		id, e := uuid.Parse(v)
		if e != nil {
			fail(w, 400, "Sucursal inválida")
			return
		}
		branch = dbUUID(id)
	}
	rows, e := sqlc.New(s.db).ListWorkOrdersByWorkshop(r.Context(), sqlc.ListWorkOrdersByWorkshopParams{WorkshopID: dbUUID(wc.WorkshopID), Status: status, BranchID: branch})
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	out := []any{}
	for _, v := range rows {
		out = append(out, map[string]any{"id": uuid.UUID(v.ID.Bytes), "branch_id": uuid.UUID(v.BranchID.Bytes), "vehicle_id": uuid.UUID(v.VehicleID.Bytes), "number": v.Number, "status": v.Status, "reason": v.Reason, "plate": v.Plate, "make": v.Make, "model": v.Model, "received_at": v.ReceivedAt.Time})
	}
	writeJSON(w, 200, out)
}

var errTransitionConflict = errors.New("transición concurrente")

func validStatus(s string) bool {
	switch s {
	case "recibido", "diagnostico", "en_reparacion", "listo", "cancelado":
		return true
	}
	return false
}
func validTransition(from, to string) bool {
	if to == "cancelado" {
		return from != "listo" && from != "cancelado"
	}
	return (from == "recibido" && to == "diagnostico") || (from == "diagnostico" && to == "en_reparacion") || (from == "en_reparacion" && to == "listo")
}
func (s *server) changeStatus(w http.ResponseWriter, r *http.Request) {
	o, wc, ok := s.findOrder(w, r)
	if !ok {
		return
	}
	if !writeAllowed(w, wc) || !branchWrite(w, wc, o) {
		return
	}
	var in struct {
		Status       string  `json:"status"`
		CancelReason *string `json:"cancel_reason"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !validStatus(in.Status) {
		fail(w, 400, "Estado inválido")
		return
	}
	if in.Status == "cancelado" && (in.CancelReason == nil || strings.TrimSpace(*in.CancelReason) == "") {
		fail(w, 400, "Motivo de cancelación obligatorio")
		return
	}
	if !validTransition(string(o.Status), in.Status) {
		fail(w, 409, "Transición inválida")
		return
	}
	now := pgtype.Timestamptz{Time: time.Now(), Valid: true}
	p := sqlc.TransitionWorkOrderStatusParams{ID: o.ID, WorkshopID: o.WorkshopID, Status: sqlc.WorkOrderStatus(in.Status), PreviousStatus: o.Status}
	if in.Status == "listo" {
		p.CompletedAt = now
	}
	if in.Status == "cancelado" {
		p.CancelledAt = now
		p.CancelReason = in.CancelReason
	}
	err := database.WithTx(r.Context(), s.db, func(q *sqlc.Queries) error {
		locked, e := q.LockWorkOrder(r.Context(), sqlc.LockWorkOrderParams{ID: o.ID, WorkshopID: o.WorkshopID})
		if e != nil {
			return e
		}
		if locked.Status != o.Status {
			return errTransitionConflict
		}
		if in.Status == "listo" {
			if e = publishOrder(r.Context(), q, wc, locked); e != nil {
				return e
			}
		}
		n, e := q.TransitionWorkOrderStatus(r.Context(), p)
		if e != nil {
			return e
		}
		if n == 0 {
			return errTransitionConflict
		}
		return audit(r.Context(), q, wc, o.ID, "work_order", "work_order.status")
	})
	if errors.Is(err, errNoJobs) {
		fail(w, 409, "Agrega al menos un trabajo antes de marcar como listo")
		return
	}
	if errors.Is(err, errTransitionConflict) {
		fail(w, 409, "Transición inválida")
		return
	}
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	o.Status = p.Status
	o.CompletedAt = p.CompletedAt
	o.CancelledAt = p.CancelledAt
	o.CancelReason = p.CancelReason
	writeJSON(w, 200, orderDTO(o))
}
func branchWrite(w http.ResponseWriter, wc WorkshopContext, o sqlc.WorkOrder) bool {
	if !branchAllowed(wc, uuid.UUID(o.BranchID.Bytes)) {
		fail(w, 403, "Acceso denegado")
		return false
	}
	return true
}

func (s *server) editOrder(w http.ResponseWriter, r *http.Request) {
	o, wc, ok := s.mutableOrder(w, r)
	if !ok {
		return
	}
	var in map[string]json.RawMessage
	if !decode(w, r, &in) {
		return
	}
	for k, v := range in {
		switch k {
		case "reason":
			if json.Unmarshal(v, &o.Reason) != nil {
				fail(w, 400, "Datos de orden inválidos")
				return
			}
			o.Reason = strings.TrimSpace(o.Reason)
		case "odometer_km":
			if json.Unmarshal(v, &o.OdometerKm) != nil || (o.OdometerKm != nil && *o.OdometerKm < 0) {
				fail(w, 400, "Datos de orden inválidos")
				return
			}
		case "public_notes":
			if json.Unmarshal(v, &o.PublicNotes) != nil {
				fail(w, 400, "Datos de orden inválidos")
				return
			}
		case "internal_notes":
			if json.Unmarshal(v, &o.InternalNotes) != nil {
				fail(w, 400, "Datos de orden inválidos")
				return
			}
		default:
			fail(w, 400, "Datos de orden inválidos")
			return
		}
	}
	q := jobQueries(r.Context(), s)
	updated, err := q.EditWorkOrder(r.Context(), sqlc.EditWorkOrderParams{ID: o.ID, WorkshopID: o.WorkshopID, Reason: o.Reason, OdometerKm: o.OdometerKm, PublicNotes: o.PublicNotes, InternalNotes: o.InternalNotes})
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	if err = audit(r.Context(), q, wc, o.ID, "work_order", "work_order.update"); err != nil {
		fail(w, 500, "Error interno")
		return
	}
	writeJSON(w, 200, orderDTO(updated))
}
