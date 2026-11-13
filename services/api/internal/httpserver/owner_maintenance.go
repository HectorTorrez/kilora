package httpserver

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"kilora/api/internal/auth"
	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/history"
	"kilora/api/internal/maintenance"
	"kilora/api/internal/values"
)

type ownerMaintenanceItem struct {
	Category       string  `json:"category"`
	Label          string  `json:"label"`
	IntervalKm     int32   `json:"interval_km"`
	IntervalMonths int     `json:"interval_months"`
	CustomInterval bool    `json:"custom_interval"`
	Status         string  `json:"status"`
	LastOn         *string `json:"last_performed_on"`
	LastSummary    *string `json:"last_summary"`
	LastKm         *int32  `json:"last_odometer_km"`
	DueDate        *string `json:"due_date"`
	DueKm          *int32  `json:"due_km"`
}

type ownerMaintenancePlan struct {
	Items          []ownerMaintenanceItem `json:"items"`
	EmailReminders bool                   `json:"email_reminders"`
	CurrentKm      *int32                 `json:"current_odometer_km"`
	LastOdometerAt *time.Time             `json:"last_odometer_at"`
	OdometerStale  bool                   `json:"odometer_stale"`
}

func loadOwnerMaintenance(ctx context.Context, q *sqlc.Queries, vehicle, user uuid.UUID, now time.Time) (ownerMaintenancePlan, error) {
	out := ownerMaintenancePlan{Items: []ownerMaintenanceItem{}, OdometerStale: true}
	prefs, err := q.GetOwnerMaintenance(ctx, sqlc.GetOwnerMaintenanceParams{VehicleID: vehicle, OwnerUserID: &user})
	if err != nil {
		return out, err
	}
	out.EmailReminders = prefs.EmailReminders
	overrides := map[string]maintenance.Interval{}
	if err = json.Unmarshal(prefs.Intervals, &overrides); err != nil {
		return out, err
	}
	rows, err := q.ListHistoryForOwner(ctx, sqlc.ListHistoryForOwnerParams{VehicleID: vehicle, OwnerUserID: &user})
	if err != nil {
		return out, err
	}
	corrections, err := q.ListCorrectionsForOwner(ctx, sqlc.ListCorrectionsForOwnerParams{VehicleID: vehicle, OwnerUserID: &user})
	if err != nil {
		return out, err
	}
	records, err := projectHistory(ctx, q, history.Viewer{IsOwner: true}, rows, corrections)
	if err != nil {
		return out, err
	}
	readings, err := q.ListOdometerReadingsForOwner(ctx, sqlc.ListOdometerReadingsForOwnerParams{VehicleID: vehicle, OwnerUserID: &user})
	if err != nil {
		return out, err
	}
	if len(readings) > 0 {
		out.CurrentKm = &readings[0].Km
		out.LastOdometerAt = &readings[0].ReadAt.Time
		out.OdometerStale = !out.LastOdometerAt.After(now.AddDate(0, 0, -30))
	}
	makeItem := func(category string) ownerMaintenanceItem {
		iv := maintenance.Intervals[category]
		custom, ok := overrides[category]
		if ok {
			iv = custom
		}
		return ownerMaintenanceItem{Category: category, Label: maintenance.Labels[category], IntervalKm: iv.Km, IntervalMonths: iv.Months, CustomInterval: ok, Status: "sin_historial"}
	}
	seen := map[string]bool{}
	local := now.In(values.Location)
	today := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.UTC)
	for _, d := range maintenance.Forecast(records, out.CurrentKm, today, overrides) {
		item := makeItem(d.Category)
		seen[d.Category] = true
		item.Status = "programado"
		if d.DueDate.IsZero() && d.DueKm == nil {
			item.Status = "sin_kilometraje"
		}
		if d.Wear >= maintenance.SoonAt {
			item.Status = "proximo"
		}
		if d.Overdue() {
			item.Status = "vencido"
		}
		last := d.LastOn.Format(values.DateLayout)
		item.LastOn, item.LastSummary, item.LastKm, item.DueKm = &last, &d.LastSummary, d.LastKm, d.DueKm
		if !d.DueDate.IsZero() {
			due := d.DueDate.Format(values.DateLayout)
			item.DueDate = &due
		}
		out.Items = append(out.Items, item)
	}
	unknown := []string{}
	for category := range maintenance.Intervals {
		if !seen[category] {
			unknown = append(unknown, category)
		}
	}
	sort.Strings(unknown)
	for _, category := range unknown {
		out.Items = append(out.Items, makeItem(category))
	}
	return out, nil
}

func (s *server) getOwnerMaintenance(w http.ResponseWriter, r *http.Request) error {
	q := sqlc.New(s.db)
	user := currentUser(r.Context()).ID
	v, err := ownedVehicle(r.Context(), q, r, user)
	if err != nil {
		return err
	}
	out, err := loadOwnerMaintenance(r.Context(), q, v.ID, user, time.Now())
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, out)
	return nil
}

func (s *server) setOwnerMaintenanceEmail(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Enabled *bool `json:"email_reminders"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	if in.Enabled == nil {
		return badRequest("Indicá si querés recibir recordatorios")
	}
	if *in.Enabled && auth.IsDemoEmail(currentUser(r.Context()).Email) {
		return forbidden("Las cuentas demo no pueden recibir correos")
	}
	user := currentUser(r.Context()).ID
	err := s.mutate(r.Context(), func(q *sqlc.Queries) (auditEvent, error) {
		v, err := ownedVehicle(r.Context(), q, r, user)
		if err != nil {
			return auditEvent{}, err
		}
		err = q.SetOwnerMaintenanceEmail(r.Context(), sqlc.SetOwnerMaintenanceEmailParams{VehicleID: v.ID, EmailReminders: *in.Enabled})
		return ownerEvent(user, "vehicle", v.ID, "maintenance.email_updated"), err
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *server) setOwnerMaintenanceInterval(w http.ResponseWriter, r *http.Request) error {
	category := chi.URLParam(r, "category")
	_, valid := maintenance.Intervals[category]
	if !valid {
		return badRequest("Categoría de mantenimiento inválida")
	}
	reset := r.Method == http.MethodDelete
	var iv maintenance.Interval
	if !reset {
		if err := decode(r, &iv); err != nil {
			return err
		}
		if !maintenance.ValidInterval(category, iv) {
			return badRequest("Usá un intervalo de 1 a 1,000,000 km o de 1 a 120 meses")
		}
	}
	data, err := json.Marshal(iv)
	if err != nil {
		return err
	}
	user := currentUser(r.Context()).ID
	err = s.mutate(r.Context(), func(q *sqlc.Queries) (auditEvent, error) {
		v, err := ownedVehicle(r.Context(), q, r, user)
		if err != nil {
			return auditEvent{}, err
		}
		if reset {
			err = q.ResetOwnerMaintenanceInterval(r.Context(), sqlc.ResetOwnerMaintenanceIntervalParams{VehicleID: v.ID, Category: category})
		} else {
			err = q.SetOwnerMaintenanceInterval(r.Context(), sqlc.SetOwnerMaintenanceIntervalParams{VehicleID: v.ID, Category: category, Interval: data})
		}
		return ownerEvent(user, "vehicle", v.ID, "maintenance.interval_updated"), err
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
