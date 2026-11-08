package httpserver

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/history"
)

func dbUUID(id uuid.UUID) pgtype.UUID { return pgtype.UUID{Bytes: id, Valid: true} }
func (s *server) history(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "vehicleID"))
	if err != nil {
		fail(w, 404, "Vehículo no encontrado")
		return
	}
	q := sqlc.New(s.db)
	ctx := r.Context()
	uid := currentUser(ctx).ID
	viewer := history.Viewer{UserID: &uid}
	var vehicle sqlc.Vehicle
	var rows []sqlc.HistoryRecord
	var corrections []sqlc.Correction
	if wc, ok := CurrentWorkshop(ctx); ok {
		viewer.WorkshopID = &wc.WorkshopID
		viewer.WorkshopLinked = true
		vehicle, err = q.GetVehicle(ctx, sqlc.GetVehicleParams{ID: dbUUID(id), WorkshopID: dbUUID(wc.WorkshopID)})
		if err == nil {
			viewer.IsOwner = vehicle.OwnerUserID.Valid && vehicle.OwnerUserID.Bytes == uid
			rows, err = q.ListHistoryByVehicle(ctx, sqlc.ListHistoryByVehicleParams{VehicleID: dbUUID(id), WorkshopID: dbUUID(wc.WorkshopID)})
		}
		if err == nil {
			corrections, err = q.ListCorrectionsByVehicle(ctx, sqlc.ListCorrectionsByVehicleParams{VehicleID: dbUUID(id), WorkshopID: dbUUID(wc.WorkshopID)})
		}
	} else {
		vehicle, err = q.GetVehicleForOwner(ctx, sqlc.GetVehicleForOwnerParams{ID: dbUUID(id), OwnerUserID: dbUUID(uid)})
		if err == nil {
			viewer.IsOwner = true
			rows, err = q.ListHistoryForOwner(ctx, sqlc.ListHistoryForOwnerParams{VehicleID: dbUUID(id), OwnerUserID: dbUUID(uid)})
		}
		if err == nil {
			corrections, err = q.ListCorrectionsForOwner(ctx, sqlc.ListCorrectionsForOwnerParams{VehicleID: dbUUID(id), OwnerUserID: dbUUID(uid)})
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
	grouped := make(map[pgtype.UUID][]sqlc.Correction)
	for _, c := range corrections {
		grouped[c.HistoryRecordID] = append(grouped[c.HistoryRecordID], c)
	}
	names := make(map[pgtype.UUID]string)
	records := make([]history.Projected, 0, len(rows))
	for _, row := range rows {
		var name *string
		if row.WorkshopID.Valid {
			n, ok := names[row.WorkshopID]
			if !ok {
				workshop, e := q.GetWorkshop(ctx, row.WorkshopID)
				if e != nil {
					fail(w, 500, "Error interno")
					return
				}
				n = workshop.Name
				names[row.WorkshopID] = n
			}
			name = &n
		}
		rec, e := history.FromSQLC(row, name, grouped[row.ID])
		if e != nil {
			fail(w, 500, "Error interno")
			return
		}
		if p, ok := history.Project(history.ResolveViewer(rec, viewer), rec); ok {
			records = append(records, p)
		}
	}
	writeJSON(w, 200, map[string]any{"vehicle": map[string]any{"id": id, "plate": vehicle.Plate, "make": vehicle.Make, "model": vehicle.Model, "year": vehicle.Year}, "records": records})
}
