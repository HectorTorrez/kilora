package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"kilora/api/internal/auth"
	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/history"
	"kilora/api/internal/maintenance"
)

const mechanicShareValidity = 7 * 24 * time.Hour
const mechanicShareNotFound = "Enlace para el mecánico no disponible"

func mechanicShareStatus(share sqlc.VehicleMechanicShare) map[string]any {
	return map[string]any{"created_at": share.CreatedAt.Time, "expires_at": share.ExpiresAt.Time, "record_ids": share.RecordIds, "include_maintenance": share.IncludeMaintenance}
}

func (s *server) getMechanicShare(w http.ResponseWriter, r *http.Request) error {
	w.Header().Set("Cache-Control", "no-store")
	q := sqlc.New(s.db)
	v, err := ownedVehicle(r.Context(), q, r, currentUser(r.Context()).ID)
	if err != nil {
		return err
	}
	share, err := q.GetActiveMechanicShare(r.Context(), v.ID)
	var active any
	if err == nil {
		active = mechanicShareStatus(share)
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	writeJSON(w, http.StatusOK, map[string]any{"active": active})
	return nil
}

func (s *server) createMechanicShare(w http.ResponseWriter, r *http.Request) error {
	w.Header().Set("Cache-Control", "no-store")
	var in struct {
		RecordIDs          []uuid.UUID `json:"record_ids"`
		IncludeMaintenance bool        `json:"include_maintenance"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	if len(in.RecordIDs) < 1 || len(in.RecordIDs) > 200 {
		return badRequest("Elegí entre 1 y 200 servicios")
	}
	seen := map[uuid.UUID]bool{}
	for _, id := range in.RecordIDs {
		if id == uuid.Nil || seen[id] {
			return badRequest("La selección de servicios es inválida")
		}
		seen[id] = true
	}
	user := currentUser(r.Context()).ID
	vehicleID, err := pathID(r, "vehicleID", vehicleNotFound)
	if err != nil {
		return err
	}
	token, hash, err := auth.NewTokenPair()
	if err != nil {
		return err
	}
	var share sqlc.VehicleMechanicShare
	var vehicle sqlc.Vehicle
	err = s.mutate(r.Context(), func(q *sqlc.Queries) (auditEvent, error) {
		vehicle, err = q.LockOwnerVehicleForService(r.Context(), sqlc.LockOwnerVehicleForServiceParams{VehicleID: vehicleID, OwnerUserID: &user})
		if err != nil {
			return auditEvent{}, notFoundIfMissing(err, vehicleNotFound)
		}
		rows, err := q.ListMechanicShareHistory(r.Context(), sqlc.ListMechanicShareHistoryParams{VehicleID: vehicleID, RecordIds: in.RecordIDs})
		if err != nil {
			return auditEvent{}, err
		}
		if len(rows) != len(in.RecordIDs) {
			return auditEvent{}, badRequest("Elegí servicios de este vehículo")
		}
		if err = q.RevokeMechanicShares(r.Context(), vehicleID); err != nil {
			return auditEvent{}, err
		}
		share, err = q.CreateMechanicShare(r.Context(), sqlc.CreateMechanicShareParams{VehicleID: vehicleID, CreatedBy: user, TokenHash: hash, RecordIds: in.RecordIDs, IncludeMaintenance: in.IncludeMaintenance, ExpiresAt: timestamptz(time.Now().Add(mechanicShareValidity))})
		return ownerEvent(user, "vehicle", vehicleID, "mechanic_share.create"), err
	})
	if err != nil {
		return err
	}
	out := mechanicShareStatus(share)
	link := s.webURL("/m/" + token)
	out["url"] = link
	out["whatsapp_url"] = whatsAppURL(nil, fmt.Sprintf("Te comparto los antecedentes de mi %s para la revisión: %s", vehicleLabel(vehicle.Make, vehicle.Model, vehicle.Year), link))
	writeJSON(w, http.StatusCreated, out)
	return nil
}

func (s *server) revokeMechanicShare(w http.ResponseWriter, r *http.Request) error {
	user := currentUser(r.Context()).ID
	id, err := pathID(r, "vehicleID", vehicleNotFound)
	if err != nil {
		return err
	}
	err = s.mutate(r.Context(), func(q *sqlc.Queries) (auditEvent, error) {
		if _, err := q.LockOwnerVehicleForService(r.Context(), sqlc.LockOwnerVehicleForServiceParams{VehicleID: id, OwnerUserID: &user}); err != nil {
			return auditEvent{}, notFoundIfMissing(err, vehicleNotFound)
		}
		return ownerEvent(user, "vehicle", id, "mechanic_share.revoke"), q.RevokeMechanicShares(r.Context(), id)
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func loadMechanicRecords(ctx context.Context, q *sqlc.Queries, vehicle uuid.UUID, ids []uuid.UUID) ([]history.Projected, error) {
	rows, err := q.ListMechanicShareHistory(ctx, sqlc.ListMechanicShareHistoryParams{VehicleID: vehicle, RecordIds: ids})
	if err != nil {
		return nil, err
	}
	corrections, err := q.ListCorrectionsForRecords(ctx, ids)
	if err != nil {
		return nil, err
	}
	grouped := map[uuid.UUID][]sqlc.Correction{}
	for _, c := range corrections {
		grouped[c.HistoryRecordID] = append(grouped[c.HistoryRecordID], c)
	}
	records := make([]history.Projected, 0, len(rows))
	for _, row := range rows {
		var workshop *sqlc.Workshop
		if row.WorkshopID != nil {
			found, err := q.GetWorkshop(ctx, *row.WorkshopID)
			if err != nil {
				return nil, err
			}
			workshop = &found
		}
		rec, err := historyRecord(row, workshop, grouped[row.ID])
		if err != nil {
			return nil, err
		}
		projected, _ := history.Project(history.ViewerReport, rec)
		records = append(records, maintenance.EffectiveRecord(projected))
	}
	sort.SliceStable(records, func(i, j int) bool { return records[i].PerformedOn > records[j].PerformedOn })
	return records, nil
}

func (s *server) publicMechanicShare(w http.ResponseWriter, r *http.Request) error {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Robots-Tag", "noindex, nofollow, noarchive")
	if err := s.limitPublicRead(r, "mechanic-share"); err != nil {
		return err
	}
	token := pathToken(r)
	if len(token) != 43 {
		return notFound(mechanicShareNotFound)
	}
	ctx := r.Context()
	q := sqlc.New(s.db)
	share, err := q.GetPublicMechanicShare(ctx, auth.HashToken(token))
	if err != nil {
		return notFoundIfMissing(err, mechanicShareNotFound)
	}
	records, err := loadMechanicRecords(ctx, q, share.VehicleID, share.RecordIds)
	if err != nil {
		return err
	}
	var upcoming []ownerMaintenanceItem
	var currentKm *int32
	if share.IncludeMaintenance {
		prefs, err := q.GetOwnerMaintenance(ctx, sqlc.GetOwnerMaintenanceParams{VehicleID: share.VehicleID, OwnerUserID: &share.CreatedBy})
		if err != nil {
			return err
		}
		overrides := map[string]maintenance.Interval{}
		if err = json.Unmarshal(prefs.Intervals, &overrides); err != nil {
			return err
		}
		readings, err := q.ListOdometerReadingsForOwner(ctx, sqlc.ListOdometerReadingsForOwnerParams{VehicleID: share.VehicleID, OwnerUserID: &share.CreatedBy})
		if err != nil {
			return err
		}
		if len(readings) > 0 {
			currentKm = &readings[0].Km
		}
		upcoming = []ownerMaintenanceItem{}
		// Forecast only the selected services; unshared history cannot leak through maintenance.
		for _, item := range maintenanceItems(records, currentKm, time.Now(), overrides) {
			if item.LastOn != nil {
				upcoming = append(upcoming, item)
			}
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"vehicle": map[string]any{"make": share.Make, "model": share.Model, "year": share.Year, "plate": share.Plate},
		"records": records, "maintenance": upcoming, "current_odometer_km": currentKm,
		"created_at": share.CreatedAt.Time, "expires_at": share.ExpiresAt.Time,
	})
	return nil
}
