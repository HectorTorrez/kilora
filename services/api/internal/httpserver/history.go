package httpserver

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/history"
)

func historyRecord(r sqlc.HistoryRecord, workshop *sqlc.Workshop, corrections []sqlc.Correction) (history.Record, error) {
	items, err := history.DecodeItems(r.Items)
	if err != nil {
		return history.Record{}, err
	}
	out := history.Record{ID: r.ID, WorkshopID: r.WorkshopID, Source: string(r.Source), PerformedOn: r.PerformedOn.Time, OdometerKm: r.OdometerKm, Summary: r.Summary, Items: items, Total: numericText(r.Total), Currency: r.Currency, WorkshopNotes: r.WorkshopNotes, InternalCost: numericText(r.InternalCost), InternalNotes: r.InternalNotes, CreatedBy: r.CreatedBy}
	if workshop != nil {
		out.WorkshopName = &workshop.Name
		out.WorkshopVerifiedAt = nullableTime(workshop.VerifiedAt)
	}
	for _, c := range corrections {
		var changes map[string]json.RawMessage
		if err := json.Unmarshal(c.Changes, &changes); err != nil {
			return history.Record{}, err
		}
		out.Corrections = append(out.Corrections, history.Correction{ID: c.ID, Reason: c.Reason, Changes: changes, CreatedBy: c.CreatedBy, CreatedAt: c.CreatedAt.Time})
	}
	return out, nil
}

// writeHistory responde con los registros visibles para viewer. total es la
// cantidad de registros del vehículo cuando rows es solo una página; nil
// significa que rows es el historial completo.
func (s *server) writeHistory(ctx context.Context, w http.ResponseWriter, q *sqlc.Queries, viewer history.Viewer, vehicle sqlc.Vehicle, rows []sqlc.HistoryRecord, corrections []sqlc.Correction, total *int64) error {
	records, err := projectHistory(ctx, q, viewer, rows, corrections)
	if err != nil {
		return err
	}
	count := int64(len(records))
	if total != nil {
		count = *total
	}
	writeJSON(w, http.StatusOK, map[string]any{"vehicle": map[string]any{"id": vehicle.ID, "plate": vehicle.Plate, "make": vehicle.Make, "model": vehicle.Model, "year": vehicle.Year}, "records": records, "total": count})
	return nil
}

// projectHistory aplica la proyección del historial a cada registro según
// quién mira y descarta los que no puede ver.
func projectHistory(ctx context.Context, q *sqlc.Queries, viewer history.Viewer, rows []sqlc.HistoryRecord, corrections []sqlc.Correction) ([]history.Projected, error) {
	grouped := make(map[uuid.UUID][]sqlc.Correction)
	for _, c := range corrections {
		grouped[c.HistoryRecordID] = append(grouped[c.HistoryRecordID], c)
	}
	receipts := make(map[uuid.UUID]*history.Receipt)
	if viewer.IsOwner {
		ids := make([]uuid.UUID, 0, len(rows))
		for _, row := range rows {
			ids = append(ids, row.ID)
		}
		metadata, err := q.ListHistoryReceiptMetadata(ctx, ids)
		if err != nil {
			return nil, err
		}
		for _, receipt := range metadata {
			receipts[receipt.HistoryRecordID] = &history.Receipt{Filename: receipt.Filename, ContentType: receipt.ContentType, SizeBytes: receipt.SizeBytes}
		}
	}
	workshops := make(map[uuid.UUID]*sqlc.Workshop)
	records := make([]history.Projected, 0, len(rows))
	for _, row := range rows {
		var workshop *sqlc.Workshop
		if row.WorkshopID != nil {
			if workshops[*row.WorkshopID] == nil {
				found, err := q.GetWorkshop(ctx, *row.WorkshopID)
				if err != nil {
					return nil, err
				}
				workshops[*row.WorkshopID] = &found
			}
			workshop = workshops[*row.WorkshopID]
		}
		rec, err := historyRecord(row, workshop, grouped[row.ID])
		if err != nil {
			return nil, err
		}
		rec.Receipt = receipts[row.ID]
		if p, ok := history.Project(history.ResolveViewer(rec, viewer), rec); ok {
			records = append(records, p)
		}
	}
	return records, nil
}

func (s *server) workshopHistory(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	id, err := pathID(r, "vehicleID", vehicleNotFound)
	if err != nil {
		return err
	}
	ctx := r.Context()
	q := sqlc.New(s.db)
	vehicle, err := q.GetVehicle(ctx, sqlc.GetVehicleParams{ID: id, WorkshopID: wc.workshopID})
	if err != nil {
		return notFoundIfMissing(err, vehicleNotFound)
	}
	rows, err := q.ListHistoryByVehicle(ctx, sqlc.ListHistoryByVehicleParams{VehicleID: id, WorkshopID: wc.workshopID})
	if err != nil {
		return err
	}
	corrections, err := q.ListCorrectionsByVehicle(ctx, sqlc.ListCorrectionsByVehicleParams{VehicleID: id, WorkshopID: wc.workshopID})
	if err != nil {
		return err
	}
	isOwner := vehicle.OwnerUserID != nil && *vehicle.OwnerUserID == wc.userID
	viewer := history.Viewer{WorkshopID: &wc.workshopID, WorkshopLinked: true, IsOwner: isOwner}
	return s.writeHistory(ctx, w, q, viewer, vehicle, rows, corrections, nil)
}

func (s *server) ownerHistory(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "vehicleID", vehicleNotFound)
	if err != nil {
		return err
	}
	limit, offset, err := pageWindow(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	q := sqlc.New(s.db)
	user := currentUser(ctx).ID
	vehicle, err := q.GetVehicleForOwner(ctx, sqlc.GetVehicleForOwnerParams{ID: id, OwnerUserID: &user})
	if err != nil {
		return notFoundIfMissing(err, vehicleNotFound)
	}

	filters, err := parseHistorySearch(r)
	if err != nil {
		return err
	}
	rows, err := q.ListHistoryForOwner(ctx, sqlc.ListHistoryForOwnerParams{VehicleID: id, OwnerUserID: &user})
	if err != nil {
		return err
	}
	corrections, err := q.ListCorrectionsForOwner(ctx, sqlc.ListCorrectionsForOwnerParams{VehicleID: id, OwnerUserID: &user})
	if err != nil {
		return err
	}
	records, err := projectHistory(ctx, q, history.Viewer{IsOwner: true}, rows, corrections)
	if err != nil {
		return err
	}
	page, total, workshops := filterOwnerHistory(records, filters, limit, offset)
	writeJSON(w, http.StatusOK, map[string]any{
		"vehicle": map[string]any{"id": vehicle.ID, "plate": vehicle.Plate, "make": vehicle.Make, "model": vehicle.Model, "year": vehicle.Year},
		"records": page, "total": total, "unfiltered_total": len(records), "workshops": workshops,
	})
	return nil
}
