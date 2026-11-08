package httpserver

import (
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/values"
)

func recommendationDTO(r sqlc.Recommendation) map[string]any {
	return map[string]any{
		"id": r.ID, "vehicle_id": r.VehicleID, "work_order_id": r.WorkOrderID,
		"description": r.Description, "category": r.Category, "due_date": nullableDate(r.DueDate), "due_km": r.DueKm,
		"status": r.Status, "resolved_at": nullableTime(r.ResolvedAt), "created_at": r.CreatedAt.Time,
	}
}

func (s *server) listWorkshopRecommendations(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	var status *sqlc.RecommendationStatus
	if v := r.URL.Query().Get("status"); v != "" {
		x := sqlc.RecommendationStatus(v)
		if !x.Valid() {
			return badRequest("Estado inválido")
		}
		status = &x
	}
	rows, err := sqlc.New(s.db).ListRecommendationsForWorkshop(r.Context(), sqlc.ListRecommendationsForWorkshopParams{WorkshopID: wc.workshopID, Status: status})
	if err != nil {
		return err
	}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		item := recommendationDTO(sqlc.Recommendation{ID: row.ID, VehicleID: row.VehicleID, WorkOrderID: row.WorkOrderID, Description: row.Description, Category: row.Category, DueDate: row.DueDate, DueKm: row.DueKm, Status: row.Status, ResolvedAt: row.ResolvedAt, CreatedAt: row.CreatedAt})
		item["plate"], item["make"], item["model"] = row.Plate, row.Make, row.Model
		out = append(out, item)
	}
	writeJSON(w, http.StatusOK, out)
	return nil
}

func (s *server) listVehicleRecommendations(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	id, err := pathID(r, "vehicleID", vehicleNotFound)
	if err != nil {
		return err
	}
	ctx := r.Context()
	q := sqlc.New(s.db)
	if err = requireLinkedVehicle(ctx, q, wc, &id); err != nil {
		return err
	}
	rows, err := q.ListRecommendationsByVehicle(ctx, sqlc.ListRecommendationsByVehicleParams{VehicleID: id, WorkshopID: wc.workshopID})
	if err != nil {
		return err
	}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		out = append(out, recommendationDTO(row))
	}
	writeJSON(w, http.StatusOK, out)
	return nil
}

func (s *server) createRecommendation(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	if err := wc.requireWriter(); err != nil {
		return err
	}
	id, err := pathID(r, "vehicleID", vehicleNotFound)
	if err != nil {
		return err
	}
	var in struct {
		Description string             `json:"description"`
		Category    *sqlc.PartCategory `json:"category"`
		DueDate     *string            `json:"due_date"`
		DueKm       *int32             `json:"due_km"`
		WorkOrderID *uuid.UUID         `json:"work_order_id"`
	}
	if err = decode(r, &in); err != nil {
		return err
	}
	in.Description = strings.TrimSpace(in.Description)
	if in.Description == "" {
		return badRequest("La descripción es obligatoria")
	}
	due := values.OptionalText(in.DueDate)
	if due == nil && in.DueKm == nil {
		return badRequest("Indicá una fecha o un kilometraje objetivo")
	}
	if in.DueKm != nil && *in.DueKm < 0 {
		return badRequest("Kilometraje inválido")
	}
	params := sqlc.CreateRecommendationParams{VehicleID: id, WorkshopID: wc.workshopID, Description: in.Description, DueKm: in.DueKm, CreatedBy: wc.userID}
	if in.Category != nil && *in.Category != "" {
		if !in.Category.Valid() {
			return badRequest("Categoría inválida")
		}
		params.Category = in.Category
	}
	if due != nil {
		d, err := time.Parse(values.DateLayout, *due)
		if err != nil {
			return badRequest("Fecha inválida")
		}
		params.DueDate = date(d)
	}
	ctx := r.Context()
	var rec sqlc.Recommendation
	err = s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		if _, err := q.GetVehicle(ctx, sqlc.GetVehicleParams{ID: id, WorkshopID: wc.workshopID}); err != nil {
			return auditEvent{}, err
		}
		if in.WorkOrderID != nil {
			o, err := q.GetWorkOrder(ctx, sqlc.GetWorkOrderParams{ID: *in.WorkOrderID, WorkshopID: wc.workshopID})
			if err != nil {
				return auditEvent{}, err
			}
			if o.VehicleID != id || !wc.canReadBranch(o.BranchID) {
				return auditEvent{}, pgx.ErrNoRows
			}
			params.WorkOrderID = &o.ID
		}
		var err error
		rec, err = q.CreateRecommendation(ctx, params)
		return wc.event("recommendation", rec.ID, "recommendation.create"), err
	})
	if err != nil {
		return notFoundIfMissing(err, "Vehículo u orden no encontrados")
	}
	writeJSON(w, http.StatusCreated, recommendationDTO(rec))
	return nil
}

func (s *server) resolveRecommendation(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	if err := wc.requireWriter(); err != nil {
		return err
	}
	id, err := pathID(r, "recommendationID", "Recomendación no encontrada")
	if err != nil {
		return err
	}
	var in struct {
		Status sqlc.RecommendationStatus `json:"status"`
	}
	if err = decode(r, &in); err != nil {
		return err
	}
	if in.Status != sqlc.RecommendationStatusHecha && in.Status != sqlc.RecommendationStatusDescartada {
		return badRequest("Estado inválido")
	}
	ctx := r.Context()
	var rec sqlc.Recommendation
	err = s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		var err error
		rec, err = q.ResolveRecommendation(ctx, sqlc.ResolveRecommendationParams{Status: in.Status, ResolvedBy: &wc.userID, ID: id, WorkshopID: wc.workshopID})
		return wc.event("recommendation", rec.ID, "recommendation."+string(in.Status)), err
	})
	if err != nil {
		return notFoundIfMissing(err, "Recomendación no encontrada o ya resuelta")
	}
	writeJSON(w, http.StatusOK, recommendationDTO(rec))
	return nil
}
