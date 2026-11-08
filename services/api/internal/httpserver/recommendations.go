package httpserver

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"kilora/api/internal/database"
	"kilora/api/internal/database/sqlc"
)

var partCategories = map[string]bool{"aceite": true, "frenos": true, "amortiguadores": true, "bateria": true, "llantas": true, "otro": true}

func optUUID(v pgtype.UUID) *uuid.UUID {
	if !v.Valid {
		return nil
	}
	id := uuid.UUID(v.Bytes)
	return &id
}
func optDate(v pgtype.Date) *string {
	if !v.Valid {
		return nil
	}
	s := v.Time.Format("2006-01-02")
	return &s
}
func optTime(v pgtype.Timestamptz) *time.Time {
	if !v.Valid {
		return nil
	}
	return &v.Time
}

func recommendationDTO(r sqlc.Recommendation) map[string]any {
	return map[string]any{
		"id": uuid.UUID(r.ID.Bytes), "vehicle_id": uuid.UUID(r.VehicleID.Bytes), "work_order_id": optUUID(r.WorkOrderID),
		"description": r.Description, "category": r.Category, "due_date": optDate(r.DueDate), "due_km": r.DueKm,
		"status": r.Status, "resolved_at": optTime(r.ResolvedAt), "created_at": r.CreatedAt.Time,
	}
}

func (s *server) listWorkshopRecommendations(w http.ResponseWriter, r *http.Request) {
	wc, _ := CurrentWorkshop(r.Context())
	var status *sqlc.RecommendationStatus
	switch v := r.URL.Query().Get("status"); v {
	case "":
	case "pendiente", "hecha", "descartada":
		st := sqlc.RecommendationStatus(v)
		status = &st
	default:
		fail(w, 400, "Estado inválido")
		return
	}
	rows, err := sqlc.New(s.db).ListRecommendationsForWorkshop(r.Context(), sqlc.ListRecommendationsForWorkshopParams{WorkshopID: dbUUID(wc.WorkshopID), Status: status})
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		item := recommendationDTO(sqlc.Recommendation{ID: row.ID, VehicleID: row.VehicleID, WorkOrderID: row.WorkOrderID, Description: row.Description, Category: row.Category, DueDate: row.DueDate, DueKm: row.DueKm, Status: row.Status, ResolvedAt: row.ResolvedAt, CreatedAt: row.CreatedAt})
		item["plate"], item["make"], item["model"] = row.Plate, row.Make, row.Model
		out = append(out, item)
	}
	writeJSON(w, 200, out)
}

func (s *server) listVehicleRecommendations(w http.ResponseWriter, r *http.Request) {
	wc, _ := CurrentWorkshop(r.Context())
	id, err := uuid.Parse(chi.URLParam(r, "vehicleID"))
	if err != nil {
		fail(w, 404, "Vehículo no encontrado")
		return
	}
	q := sqlc.New(s.db)
	if _, err := q.GetVehicle(r.Context(), sqlc.GetVehicleParams{ID: dbUUID(id), WorkshopID: dbUUID(wc.WorkshopID)}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			fail(w, 404, "Vehículo no encontrado")
			return
		}
		fail(w, 500, "Error interno")
		return
	}
	rows, err := q.ListRecommendationsByVehicle(r.Context(), sqlc.ListRecommendationsByVehicleParams{VehicleID: dbUUID(id), WorkshopID: dbUUID(wc.WorkshopID)})
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		out = append(out, recommendationDTO(row))
	}
	writeJSON(w, 200, out)
}

func (s *server) createRecommendation(w http.ResponseWriter, r *http.Request) {
	wc, _ := CurrentWorkshop(r.Context())
	if !writeAllowed(w, wc) {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "vehicleID"))
	if err != nil {
		fail(w, 404, "Vehículo no encontrado")
		return
	}
	var in struct {
		Description string     `json:"description"`
		Category    *string    `json:"category"`
		DueDate     *string    `json:"due_date"`
		DueKm       *int32     `json:"due_km"`
		WorkOrderID *uuid.UUID `json:"work_order_id"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Description = strings.TrimSpace(in.Description)
	if in.Description == "" {
		fail(w, 400, "La descripción es obligatoria")
		return
	}
	if (in.DueDate == nil || *in.DueDate == "") && in.DueKm == nil {
		fail(w, 400, "Indicá una fecha o un kilometraje objetivo")
		return
	}
	if in.DueKm != nil && *in.DueKm < 0 {
		fail(w, 400, "Kilometraje inválido")
		return
	}
	params := sqlc.CreateRecommendationParams{VehicleID: dbUUID(id), WorkshopID: dbUUID(wc.WorkshopID), Description: in.Description, DueKm: in.DueKm, CreatedBy: dbUUID(wc.UserID)}
	if in.Category != nil && *in.Category != "" {
		if !partCategories[*in.Category] {
			fail(w, 400, "Categoría inválida")
			return
		}
		c := sqlc.PartCategory(*in.Category)
		params.Category = &c
	}
	if in.DueDate != nil && *in.DueDate != "" {
		d, err := time.Parse("2006-01-02", *in.DueDate)
		if err != nil {
			fail(w, 400, "Fecha inválida")
			return
		}
		params.DueDate = pgtype.Date{Time: d, Valid: true}
	}
	var rec sqlc.Recommendation
	err = database.WithTx(r.Context(), s.db, func(q *sqlc.Queries) error {
		if _, err := q.GetVehicle(r.Context(), sqlc.GetVehicleParams{ID: dbUUID(id), WorkshopID: dbUUID(wc.WorkshopID)}); err != nil {
			return err
		}
		if in.WorkOrderID != nil {
			o, err := q.GetWorkOrder(r.Context(), sqlc.GetWorkOrderParams{ID: dbUUID(*in.WorkOrderID), WorkshopID: dbUUID(wc.WorkshopID)})
			if err != nil {
				return err
			}
			if o.VehicleID.Bytes != id {
				return pgx.ErrNoRows
			}
			params.WorkOrderID = o.ID
		}
		var err error
		rec, err = q.CreateRecommendation(r.Context(), params)
		if err != nil {
			return err
		}
		return audit(r.Context(), q, wc, rec.ID, "recommendation", "recommendation.create")
	})
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 404, "Vehículo u orden no encontrados")
		return
	}
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	writeJSON(w, 201, recommendationDTO(rec))
}

func (s *server) resolveRecommendation(w http.ResponseWriter, r *http.Request) {
	wc, _ := CurrentWorkshop(r.Context())
	if !writeAllowed(w, wc) {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "recommendationID"))
	if err != nil {
		fail(w, 404, "Recomendación no encontrada")
		return
	}
	var in struct {
		Status string `json:"status"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Status != "hecha" && in.Status != "descartada" {
		fail(w, 400, "Estado inválido")
		return
	}
	var rec sqlc.Recommendation
	err = database.WithTx(r.Context(), s.db, func(q *sqlc.Queries) error {
		var err error
		rec, err = q.ResolveRecommendation(r.Context(), sqlc.ResolveRecommendationParams{Status: sqlc.RecommendationStatus(in.Status), ResolvedBy: dbUUID(wc.UserID), ID: dbUUID(id), WorkshopID: dbUUID(wc.WorkshopID)})
		if err != nil {
			return err
		}
		return audit(r.Context(), q, wc, rec.ID, "recommendation", "recommendation."+in.Status)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 404, "Recomendación no encontrada o ya resuelta")
		return
	}
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	writeJSON(w, 200, recommendationDTO(rec))
}
