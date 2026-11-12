package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"
	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/values"
)

const orderNotFound = "Orden no encontrada"

var errInvalidOrder = badRequest("Datos de orden inválidos")
var errInvalidTransition = conflict("Transición inválida")

// nextOrderStatus is the only forward path; cancelling is allowed from any state before listo.
var nextOrderStatus = map[sqlc.WorkOrderStatus]sqlc.WorkOrderStatus{
	sqlc.WorkOrderStatusRecibido:     sqlc.WorkOrderStatusDiagnostico,
	sqlc.WorkOrderStatusDiagnostico:  sqlc.WorkOrderStatusEnReparacion,
	sqlc.WorkOrderStatusEnReparacion: sqlc.WorkOrderStatusListo,
}

func isClosed(s sqlc.WorkOrderStatus) bool {
	return s == sqlc.WorkOrderStatusListo || s == sqlc.WorkOrderStatusCancelado
}

func validTransition(from, to sqlc.WorkOrderStatus) bool {
	if to == sqlc.WorkOrderStatusCancelado {
		return !isClosed(from)
	}
	return nextOrderStatus[from] == to
}

func orderDTO(o sqlc.WorkOrder) map[string]any {
	return map[string]any{"id": o.ID, "workshop_id": o.WorkshopID, "branch_id": o.BranchID, "vehicle_id": o.VehicleID, "number": o.Number, "status": o.Status, "reason": o.Reason, "odometer_km": o.OdometerKm, "internal_notes": o.InternalNotes, "public_notes": o.PublicNotes, "received_at": o.ReceivedAt.Time, "completed_at": nullableTime(o.CompletedAt), "cancelled_at": nullableTime(o.CancelledAt), "cancel_reason": o.CancelReason, "created_by": o.CreatedBy}
}

func jobDTO(j sqlc.Job) map[string]any {
	return map[string]any{"id": j.ID, "work_order_id": j.WorkOrderID, "position": j.Position, "description": j.Description, "category": j.Category, "part": j.Part, "labor_price": numericText(j.LaborPrice), "internal_cost": numericText(j.InternalCost), "mechanic_notes": j.MechanicNotes, "currency": j.Currency}
}

func partDTO(p sqlc.Part) map[string]any {
	return map[string]any{"id": p.ID, "job_id": p.JobID, "name": p.Name, "brand": p.Brand, "model": p.Model, "quantity": numericText(p.Quantity), "unit_price": numericText(p.UnitPrice), "internal_cost": numericText(p.InternalCost), "currency": p.Currency}
}

type newOrder struct {
	branch, vehicle uuid.UUID
	reason          string
	odometerKm      *int32
	internalNotes   *string
}

// insertOrder is the one way a work order comes into existence, whether typed in or converted from a quote.
func insertOrder(ctx context.Context, q *sqlc.Queries, wc workshopAccess, in newOrder) (sqlc.WorkOrder, error) {
	number, err := q.NextWorkOrderNumber(ctx, wc.workshopID)
	if err != nil {
		return sqlc.WorkOrder{}, err
	}
	o, err := q.CreateWorkOrder(ctx, sqlc.CreateWorkOrderParams{WorkshopID: wc.workshopID, BranchID: in.branch, VehicleID: in.vehicle, Number: number, Reason: in.reason, OdometerKm: in.odometerKm, InternalNotes: in.internalNotes, CreatedBy: wc.userID})
	if err != nil {
		return o, notFoundIfMissing(err, "Vehículo no encontrado")
	}
	if in.odometerKm != nil {
		if _, err = q.CreateOdometerReading(ctx, sqlc.CreateOdometerReadingParams{VehicleID: o.VehicleID, Km: *in.odometerKm, ReadAt: timestamptz(time.Now()), Source: sqlc.OdometerSourceOrden, WorkOrderID: &o.ID, RecordedBy: &wc.userID}); err != nil {
			return o, err
		}
	}
	if _, err = q.TouchVehicleActivity(ctx, sqlc.TouchVehicleActivityParams{VehicleID: o.VehicleID, WorkshopID: o.WorkshopID}); err != nil {
		return o, err
	}
	return o, recordAudit(ctx, q, wc.event("work_order", o.ID, "work_order.create"))
}

func (s *server) createOrder(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	if err := wc.requireWriter(); err != nil {
		return err
	}
	var in struct {
		VehicleID     uuid.UUID `json:"vehicle_id"`
		BranchID      uuid.UUID `json:"branch_id"`
		Reason        string    `json:"reason"`
		OdometerKm    *int32    `json:"odometer_km"`
		InternalNotes *string   `json:"internal_notes"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	in.Reason = strings.TrimSpace(in.Reason)
	if in.VehicleID == uuid.Nil || in.BranchID == uuid.Nil || in.Reason == "" || (in.OdometerKm != nil && *in.OdometerKm < 0) {
		return errInvalidOrder
	}
	if err := wc.requireBranchWriter(in.BranchID); err != nil {
		return err
	}
	var o sqlc.WorkOrder
	err := retryNumbered(func() error {
		return s.tx(r.Context(), func(q *sqlc.Queries) error {
			var err error
			o, err = insertOrder(r.Context(), q, wc, newOrder{branch: in.BranchID, vehicle: in.VehicleID, reason: in.Reason, odometerKm: in.OdometerKm, internalNotes: in.InternalNotes})
			return err
		})
	})
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, orderDTO(o))
	return nil
}

func (s *server) findOrder(ctx context.Context, r *http.Request, wc workshopAccess) (sqlc.WorkOrder, error) {
	id, err := pathID(r, "orderID", orderNotFound)
	if err != nil {
		return sqlc.WorkOrder{}, err
	}
	o, err := sqlc.New(s.db).GetWorkOrder(ctx, sqlc.GetWorkOrderParams{ID: id, WorkshopID: wc.workshopID})
	if err != nil {
		return o, notFoundIfMissing(err, orderNotFound)
	}
	if !wc.canReadBranch(o.BranchID) {
		return o, notFound(orderNotFound)
	}
	return o, nil
}

func (s *server) getOrder(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	ctx := r.Context()
	o, err := s.findOrder(ctx, r, wc)
	if err != nil {
		return err
	}
	q := sqlc.New(s.db)
	jobs, err := q.ListJobsByWorkOrder(ctx, sqlc.ListJobsByWorkOrderParams{WorkOrderID: o.ID, WorkshopID: wc.workshopID})
	if err != nil {
		return err
	}
	parts, err := q.ListPartsByWorkOrder(ctx, sqlc.ListPartsByWorkOrderParams{WorkOrderID: o.ID, WorkshopID: wc.workshopID})
	if err != nil {
		return err
	}
	out := orderDTO(o)
	jobList := []any{}
	for _, j := range jobs {
		jobParts := []any{}
		for _, p := range parts {
			if p.JobID == j.ID {
				jobParts = append(jobParts, partDTO(p))
			}
		}
		item := jobDTO(j)
		item["parts"] = jobParts
		jobList = append(jobList, item)
	}
	out["jobs"] = jobList
	meta, err := q.GetOrderQuoteMeta(ctx, sqlc.GetOrderQuoteMetaParams{WorkOrderID: &o.ID, WorkshopID: o.WorkshopID})
	if err == nil {
		quote, err := s.loadQuote(ctx, meta.ID)
		if err != nil {
			return err
		}
		out["quote"] = quote
		charged, err := q.GetHistoryTotalByWorkOrder(ctx, &o.ID)
		if err == nil {
			quoted, _ := decimal.NewFromString(quote.Total)
			actual, _ := decimal.NewFromString(charged)
			out["quote_comparison"] = map[string]any{"quote_total": quote.Total, "charged_total": charged, "difference": actual.Sub(quoted).StringFixed(2)}
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if id, err := q.GetHistoryIDByOrder(ctx, &o.ID); err == nil {
		out["history_record_id"] = id
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	writeJSON(w, http.StatusOK, out)
	return nil
}

func (s *server) listOrders(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	var status *sqlc.WorkOrderStatus
	if v := r.URL.Query().Get("status"); v != "" {
		x := sqlc.WorkOrderStatus(v)
		if !x.Valid() {
			return badRequest("Estado inválido")
		}
		status = &x
	}
	var branch *uuid.UUID
	if v := r.URL.Query().Get("branch_id"); v != "" {
		id, err := uuid.Parse(v)
		if err != nil {
			return badRequest("Sucursal inválida")
		}
		branch = &id
	}
	rows, err := sqlc.New(s.db).ListWorkOrdersByWorkshop(r.Context(), sqlc.ListWorkOrdersByWorkshopParams{WorkshopID: wc.workshopID, Status: status, BranchID: branch, BranchIds: wc.branchIDs})
	if err != nil {
		return err
	}
	out := []any{}
	for _, v := range rows {
		out = append(out, map[string]any{"id": v.ID, "branch_id": v.BranchID, "vehicle_id": v.VehicleID, "number": v.Number, "status": v.Status, "reason": v.Reason, "plate": v.Plate, "make": v.Make, "model": v.Model, "received_at": v.ReceivedAt.Time})
	}
	writeJSON(w, http.StatusOK, out)
	return nil
}

func (s *server) changeStatus(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	ctx := r.Context()
	o, err := s.findOrder(ctx, r, wc)
	if err != nil {
		return err
	}
	if err = wc.requireBranchWriter(o.BranchID); err != nil {
		return err
	}
	var in struct {
		Status       sqlc.WorkOrderStatus `json:"status"`
		CancelReason *string              `json:"cancel_reason"`
	}
	if err = decode(r, &in); err != nil {
		return err
	}
	if !in.Status.Valid() {
		return badRequest("Estado inválido")
	}
	if in.Status == sqlc.WorkOrderStatusCancelado && values.OptionalText(in.CancelReason) == nil {
		return badRequest("Motivo de cancelación obligatorio")
	}
	if !validTransition(o.Status, in.Status) {
		return errInvalidTransition
	}
	p := sqlc.TransitionWorkOrderStatusParams{ID: o.ID, WorkshopID: o.WorkshopID, Status: in.Status, PreviousStatus: o.Status}
	switch in.Status {
	case sqlc.WorkOrderStatusListo:
		p.CompletedAt = timestamptz(time.Now())
	case sqlc.WorkOrderStatusCancelado:
		p.CancelledAt = timestamptz(time.Now())
		p.CancelReason = in.CancelReason
	}
	err = s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		locked, err := q.LockWorkOrder(ctx, sqlc.LockWorkOrderParams{ID: o.ID, WorkshopID: o.WorkshopID})
		if err != nil {
			return auditEvent{}, err
		}
		if locked.Status != o.Status {
			return auditEvent{}, errInvalidTransition
		}
		if in.Status == sqlc.WorkOrderStatusListo {
			if err = publishOrder(ctx, q, wc, locked); err != nil {
				return auditEvent{}, err
			}
		}
		if _, err = q.TransitionWorkOrderStatus(ctx, p); err != nil {
			return auditEvent{}, err
		}
		return wc.event("work_order", o.ID, "work_order.status"), nil
	})
	if err != nil {
		return err
	}
	o.Status, o.CompletedAt, o.CancelledAt, o.CancelReason = p.Status, p.CompletedAt, p.CancelledAt, p.CancelReason
	writeJSON(w, http.StatusOK, orderDTO(o))
	return nil
}

// withOpenOrder locks an order that can still be edited and commits fn's change with its audit event.
func (s *server) withOpenOrder(r *http.Request, wc workshopAccess, fn func(q *sqlc.Queries, o sqlc.WorkOrder) (auditEvent, error)) error {
	id, err := pathID(r, "orderID", orderNotFound)
	if err != nil {
		return err
	}
	ctx := r.Context()
	return s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		o, err := q.LockWorkOrder(ctx, sqlc.LockWorkOrderParams{ID: id, WorkshopID: wc.workshopID})
		if err != nil {
			return auditEvent{}, notFoundIfMissing(err, orderNotFound)
		}
		if !wc.canReadBranch(o.BranchID) {
			return auditEvent{}, notFound(orderNotFound)
		}
		if err = wc.requireBranchWriter(o.BranchID); err != nil {
			return auditEvent{}, err
		}
		if isClosed(o.Status) {
			return auditEvent{}, conflict("La orden está cerrada")
		}
		return fn(q, o)
	})
}

func applyOrderEdit(o *sqlc.WorkOrder, in map[string]json.RawMessage) error {
	for k, v := range in {
		var err error
		switch k {
		case "reason":
			err = json.Unmarshal(v, &o.Reason)
			o.Reason = strings.TrimSpace(o.Reason)
			if err == nil && o.Reason == "" {
				return errInvalidOrder
			}
		case "odometer_km":
			err = json.Unmarshal(v, &o.OdometerKm)
			if err == nil && o.OdometerKm != nil && *o.OdometerKm < 0 {
				return errInvalidOrder
			}
		case "public_notes":
			err = json.Unmarshal(v, &o.PublicNotes)
		case "internal_notes":
			err = json.Unmarshal(v, &o.InternalNotes)
		default:
			return errInvalidOrder
		}
		if err != nil {
			return errInvalidOrder
		}
	}
	return nil
}

func (s *server) editOrder(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	ctx := r.Context()
	var updated sqlc.WorkOrder
	err := s.withOpenOrder(r, wc, func(q *sqlc.Queries, o sqlc.WorkOrder) (auditEvent, error) {
		var in map[string]json.RawMessage
		if err := decode(r, &in); err != nil {
			return auditEvent{}, err
		}
		if err := applyOrderEdit(&o, in); err != nil {
			return auditEvent{}, err
		}
		var err error
		updated, err = q.EditWorkOrder(ctx, sqlc.EditWorkOrderParams{ID: o.ID, WorkshopID: o.WorkshopID, Reason: o.Reason, OdometerKm: o.OdometerKm, PublicNotes: o.PublicNotes, InternalNotes: o.InternalNotes})
		return wc.event("work_order", o.ID, "work_order.update"), err
	})
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, orderDTO(updated))
	return nil
}

func (s *server) createJob(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	ctx := r.Context()
	var created sqlc.Job
	err := s.withOpenOrder(r, wc, func(q *sqlc.Queries, o sqlc.WorkOrder) (auditEvent, error) {
		var in struct {
			Description   string             `json:"description"`
			Category      *sqlc.PartCategory `json:"category"`
			Part          *string            `json:"part"`
			LaborPrice    json.RawMessage    `json:"labor_price"`
			InternalCost  json.RawMessage    `json:"internal_cost"`
			MechanicNotes *string            `json:"mechanic_notes"`
		}
		if err := decode(r, &in); err != nil {
			return auditEvent{}, err
		}
		in.Description = strings.TrimSpace(in.Description)
		labor, okLabor := optionalMoney(in.LaborPrice)
		cost, okCost := optionalMoney(in.InternalCost)
		if in.Description == "" || !okLabor || !okCost {
			return auditEvent{}, badRequest("Datos de trabajo inválidos")
		}
		if in.Category != nil && !in.Category.Valid() {
			return auditEvent{}, badRequest("Categoría inválida")
		}
		part, category, err := resolvePart(in.Part, in.Category)
		if err != nil {
			return auditEvent{}, err
		}
		position, err := q.NextJobPosition(ctx, o.ID)
		if err != nil {
			return auditEvent{}, err
		}
		created, err = q.CreateJob(ctx, sqlc.CreateJobParams{WorkOrderID: o.ID, WorkshopID: wc.workshopID, Position: position, Description: in.Description, Category: category, Part: part, LaborPrice: labor, InternalCost: cost, MechanicNotes: in.MechanicNotes, Currency: values.Currency})
		return wc.event("job", created.ID, "job.create"), err
	})
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, jobDTO(created))
	return nil
}

func findJob(ctx context.Context, r *http.Request, q *sqlc.Queries, o sqlc.WorkOrder) (sqlc.Job, error) {
	id, err := pathID(r, "jobID", "Trabajo no encontrado")
	if err != nil {
		return sqlc.Job{}, err
	}
	j, err := q.GetJob(ctx, sqlc.GetJobParams{ID: id, WorkOrderID: o.ID, WorkshopID: o.WorkshopID})
	return j, notFoundIfMissing(err, "Trabajo no encontrado")
}

func (s *server) deleteJob(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	ctx := r.Context()
	err := s.withOpenOrder(r, wc, func(q *sqlc.Queries, o sqlc.WorkOrder) (auditEvent, error) {
		j, err := findJob(ctx, r, q, o)
		if err != nil {
			return auditEvent{}, err
		}
		_, err = q.DeleteJob(ctx, sqlc.DeleteJobParams{ID: j.ID, WorkshopID: wc.workshopID})
		return wc.event("job", j.ID, "job.delete"), err
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *server) createPart(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	ctx := r.Context()
	var created sqlc.Part
	err := s.withOpenOrder(r, wc, func(q *sqlc.Queries, o sqlc.WorkOrder) (auditEvent, error) {
		j, err := findJob(ctx, r, q, o)
		if err != nil {
			return auditEvent{}, err
		}
		var in struct {
			Name         string          `json:"name"`
			Brand        *string         `json:"brand"`
			Model        *string         `json:"model"`
			Quantity     json.RawMessage `json:"quantity"`
			UnitPrice    json.RawMessage `json:"unit_price"`
			InternalCost json.RawMessage `json:"internal_cost"`
		}
		if err = decode(r, &in); err != nil {
			return auditEvent{}, err
		}
		in.Name = strings.TrimSpace(in.Name)
		if isAbsent(in.Quantity) {
			in.Quantity = json.RawMessage("1")
		}
		quantity, okQuantity := requiredQuantity(in.Quantity)
		price, okPrice := optionalMoney(in.UnitPrice)
		cost, okCost := optionalMoney(in.InternalCost)
		if in.Name == "" || !okQuantity || !okPrice || !okCost {
			return auditEvent{}, badRequest("Datos de pieza inválidos")
		}
		created, err = q.CreatePart(ctx, sqlc.CreatePartParams{JobID: j.ID, WorkshopID: wc.workshopID, Name: in.Name, Brand: in.Brand, Model: in.Model, Quantity: quantity, UnitPrice: price, InternalCost: cost, Currency: values.Currency})
		return wc.event("part", created.ID, "part.create"), err
	})
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, partDTO(created))
	return nil
}

func (s *server) deletePart(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	ctx := r.Context()
	err := s.withOpenOrder(r, wc, func(q *sqlc.Queries, o sqlc.WorkOrder) (auditEvent, error) {
		j, err := findJob(ctx, r, q, o)
		if err != nil {
			return auditEvent{}, err
		}
		id, err := pathID(r, "partID", "Pieza no encontrada")
		if err != nil {
			return auditEvent{}, err
		}
		n, err := q.DeletePart(ctx, sqlc.DeletePartParams{ID: id, JobID: j.ID, WorkshopID: wc.workshopID})
		if err != nil {
			return auditEvent{}, err
		}
		if n == 0 {
			return auditEvent{}, notFound("Pieza no encontrada")
		}
		return wc.event("part", id, "part.delete"), nil
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
