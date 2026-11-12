package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"kilora/api/internal/auth"
	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/history"
)

const (
	reportValidity  = 30 * 24 * time.Hour
	reportNotFound  = "Reporte no disponible"
	maxReportPrompt = 60 // servicios más recientes que recibe la IA
)

type reportStats struct {
	Services        int     `json:"services"`
	WorkshopRecords int     `json:"workshop_records"`
	VerifiedRecords int     `json:"verified_records"`
	OwnerRecords    int     `json:"owner_records"`
	Workshops       int     `json:"workshops"`
	FirstOn         *string `json:"first_performed_on"`
	LastOn          *string `json:"last_performed_on"`
	LatestKm        *int32  `json:"latest_odometer_km"`
}

type reportData struct {
	records  []history.Projected
	stats    reportStats
	readings []sqlc.ListOdometerForReportRow
}

// loadReport arma el contenido del reporte: todo el historial del vehículo
// con la proyección de reporte (sin montos, notas ni datos internos).
func loadReport(ctx context.Context, q *sqlc.Queries, vehicleID uuid.UUID) (reportData, error) {
	rows, err := q.ListHistoryForReport(ctx, vehicleID)
	if err != nil {
		return reportData{}, err
	}
	corrections, err := q.ListCorrectionsForVehicleReport(ctx, vehicleID)
	if err != nil {
		return reportData{}, err
	}
	grouped := make(map[uuid.UUID][]sqlc.Correction)
	for _, c := range corrections {
		grouped[c.HistoryRecordID] = append(grouped[c.HistoryRecordID], c)
	}
	workshops := map[uuid.UUID]*sqlc.Workshop{}
	d := reportData{records: make([]history.Projected, 0, len(rows))}
	for _, row := range rows {
		var workshop *sqlc.Workshop
		if row.WorkshopID != nil {
			if workshops[*row.WorkshopID] == nil {
				found, err := q.GetWorkshop(ctx, *row.WorkshopID)
				if err != nil {
					return reportData{}, err
				}
				workshops[*row.WorkshopID] = &found
			}
			workshop = workshops[*row.WorkshopID]
		}
		rec, err := historyRecord(row, workshop, grouped[row.ID])
		if err != nil {
			return reportData{}, err
		}
		p, _ := history.Project(history.ViewerReport, rec)
		d.records = append(d.records, p)
		if rec.Source == "propietario" {
			d.stats.OwnerRecords++
		} else {
			d.stats.WorkshopRecords++
			if rec.WorkshopVerifiedAt != nil {
				d.stats.VerifiedRecords++
			}
		}
	}
	d.stats.Services = len(d.records)
	d.stats.Workshops = len(workshops)
	if n := len(d.records); n > 0 {
		first, last := d.records[n-1].PerformedOn, d.records[0].PerformedOn
		d.stats.FirstOn, d.stats.LastOn = &first, &last
	}
	if d.readings, err = q.ListOdometerForReport(ctx, vehicleID); err != nil {
		return reportData{}, err
	}
	if len(d.readings) > 0 {
		d.stats.LatestKm = &d.readings[0].Km
	}
	return d, nil
}

// promptRecords quita IDs y campos vacíos que no aportan al resumen.
func promptRecords(records []history.Projected) []map[string]any {
	if len(records) > maxReportPrompt {
		records = records[:maxReportPrompt]
	}
	out := make([]map[string]any, 0, len(records))
	for _, r := range records {
		data, _ := json.Marshal(r)
		var m map[string]any
		_ = json.Unmarshal(data, &m)
		delete(m, "id")
		if list, ok := m["corrections"].([]any); ok {
			for _, c := range list {
				if cm, ok := c.(map[string]any); ok {
					delete(cm, "id")
				}
			}
		}
		out = append(out, m)
	}
	return out
}

func reportStatusDTO(r sqlc.VehicleReport) map[string]any {
	return map[string]any{"created_at": r.CreatedAt.Time, "expires_at": r.ExpiresAt.Time, "summary": r.Summary}
}

// createReport crea el enlace del reporte para compartir (al vender el
// vehículo). Desactiva los enlaces anteriores. Si la IA está activa, guarda
// un resumen del historial; si falla, el reporte sale sin resumen.
func (s *server) createReport(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	q := sqlc.New(s.db)
	user := currentUser(ctx).ID
	vehicle, err := ownedVehicle(ctx, q, r, user)
	if err != nil {
		return err
	}
	var summary *string
	if s.ai != nil && s.aiAllowed(r) == nil {
		d, err := loadReport(ctx, q, vehicle.ID)
		if err != nil {
			return err
		}
		if len(d.records) > 0 {
			text, err := s.ai.ReportSummary(ctx, vehicleLabel(vehicle.Make, vehicle.Model, vehicle.Year), d.stats, promptRecords(d.records))
			if err != nil {
				s.logger.Warn("resumen del reporte", "error", err)
			} else if text != "" {
				summary = &text
			}
		}
	}
	token, hash, err := auth.NewTokenPair()
	if err != nil {
		return err
	}
	var rep sqlc.VehicleReport
	err = s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		if err := q.RevokeVehicleReports(ctx, vehicle.ID); err != nil {
			return auditEvent{}, err
		}
		rep, err = q.CreateVehicleReport(ctx, sqlc.CreateVehicleReportParams{VehicleID: vehicle.ID, CreatedBy: user, TokenHash: hash, Summary: summary, ExpiresAt: timestamptz(time.Now().Add(reportValidity))})
		return ownerEvent(user, "vehicle_report", rep.ID, "report.create"), err
	})
	if err != nil {
		return err
	}
	link := s.webURL("/r/" + token)
	text := fmt.Sprintf("Historial de mantenimiento de mi %s en Kilora: %s", vehicleLabel(vehicle.Make, vehicle.Model, vehicle.Year), link)
	out := reportStatusDTO(rep)
	out["url"], out["whatsapp_url"] = link, whatsAppURL(nil, text)
	writeJSON(w, http.StatusCreated, out)
	return nil
}

func (s *server) getReportStatus(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	q := sqlc.New(s.db)
	vehicle, err := ownedVehicle(ctx, q, r, currentUser(ctx).ID)
	if err != nil {
		return err
	}
	rep, err := q.GetActiveVehicleReport(ctx, vehicle.ID)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusOK, map[string]any{"active": nil})
		return nil
	}
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, map[string]any{"active": reportStatusDTO(rep)})
	return nil
}

func (s *server) revokeReport(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	user := currentUser(ctx).ID
	err := s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		vehicle, err := ownedVehicle(ctx, q, r, user)
		if err != nil {
			return auditEvent{}, err
		}
		return ownerEvent(user, "vehicle", vehicle.ID, "report.revoke"), q.RevokeVehicleReports(ctx, vehicle.ID)
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// publicReport muestra el reporte a quien tenga el enlace, sin cuenta.
func (s *server) publicReport(w http.ResponseWriter, r *http.Request) error {
	if err := s.limitPublicRead(r, "report"); err != nil {
		return err
	}
	ctx := r.Context()
	q := sqlc.New(s.db)
	rep, err := q.GetPublicVehicleReport(ctx, auth.HashToken(pathToken(r)))
	if err != nil {
		return notFoundIfMissing(err, reportNotFound)
	}
	d, err := loadReport(ctx, q, rep.VehicleID)
	if err != nil {
		return err
	}
	readings := make([]map[string]any, 0, len(d.readings))
	for _, o := range d.readings {
		readings = append(readings, map[string]any{"km": o.Km, "read_at": o.ReadAt.Time})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"vehicle":           map[string]any{"make": rep.Make, "model": rep.Model, "year": rep.Year, "plate": rep.Plate, "body_type": rep.BodyType},
		"summary":           rep.Summary,
		"stats":             d.stats,
		"records":           d.records,
		"odometer_readings": readings,
		"created_at":        rep.CreatedAt.Time,
		"expires_at":        rep.ExpiresAt.Time,
	})
	return nil
}
