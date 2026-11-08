package httpserver

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	decimalpkg "github.com/shopspring/decimal"
	"kilora/api/internal/database"
	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/history"
)

func ownerVehicle(q *sqlc.Queries, r *http.Request) (sqlc.Vehicle, error) {
	id, e := uuid.Parse(chi.URLParam(r, "vehicleID"))
	if e != nil {
		return sqlc.Vehicle{}, pgx.ErrNoRows
	}
	return q.GetVehicleForOwner(r.Context(), sqlc.GetVehicleForOwnerParams{ID: dbUUID(id), OwnerUserID: dbUUID(currentUser(r.Context()).ID)})
}
func ownerError(w http.ResponseWriter, e error) bool {
	if e == nil {
		return false
	}
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404, "Vehículo no encontrado")
	} else {
		fail(w, 500, "Error interno")
	}
	return true
}
func ownerBase(v sqlc.Vehicle) map[string]any {
	return map[string]any{"id": uuid.UUID(v.ID.Bytes), "plate": v.Plate, "make": v.Make, "model": v.Model, "year": v.Year, "status": v.Status}
}
func (s *server) ownerVehicleData(q *sqlc.Queries, r *http.Request, v sqlc.Vehicle) (map[string]any, error) {
	uid := dbUUID(currentUser(r.Context()).ID)
	out := ownerBase(v)
	readings, e := q.ListOdometerReadingsForOwner(r.Context(), sqlc.ListOdometerReadingsForOwnerParams{VehicleID: v.ID, OwnerUserID: uid})
	if e != nil {
		return nil, e
	}
	out["last_odometer_km"] = nil
	if len(readings) > 0 {
		out["last_odometer_km"] = readings[0].Km
	}
	rows, e := q.ListHistoryForOwner(r.Context(), sqlc.ListHistoryForOwnerParams{VehicleID: v.ID, OwnerUserID: uid})
	if e != nil {
		return nil, e
	}
	out["history_count"] = len(rows)
	out["last_service"] = nil
	if len(rows) > 0 {
		out["last_service"] = map[string]any{"performed_on": rows[0].PerformedOn.Time.Format("2006-01-02"), "summary": rows[0].Summary}
	}
	return out, nil
}
func (s *server) listOwnerVehicles(w http.ResponseWriter, r *http.Request) {
	q := sqlc.New(s.db)
	vs, e := q.ListVehiclesByOwner(r.Context(), dbUUID(currentUser(r.Context()).ID))
	if ownerError(w, e) {
		return
	}
	out := []map[string]any{}
	for _, v := range vs {
		item, e := s.ownerVehicleData(q, r, v)
		if ownerError(w, e) {
			return
		}
		out = append(out, item)
	}
	writeJSON(w, 200, out)
}
func (s *server) getOwnerVehicle(w http.ResponseWriter, r *http.Request) {
	q := sqlc.New(s.db)
	v, e := ownerVehicle(q, r)
	if ownerError(w, e) {
		return
	}
	out, e := s.ownerVehicleData(q, r, v)
	if ownerError(w, e) {
		return
	}
	uid := dbUUID(currentUser(r.Context()).ID)
	readings, e := q.ListOdometerReadingsForOwner(r.Context(), sqlc.ListOdometerReadingsForOwnerParams{VehicleID: v.ID, OwnerUserID: uid})
	if ownerError(w, e) {
		return
	}
	if len(readings) > 10 {
		readings = readings[:10]
	}
	out["odometer_readings"] = readings
	ws, e := q.ListOwnerWorkshops(r.Context(), sqlc.ListOwnerWorkshopsParams{ID: v.ID, OwnerUserID: uid})
	if ownerError(w, e) {
		return
	}
	workshops := []map[string]any{}
	for _, x := range ws {
		workshops = append(workshops, map[string]any{"name": x.Name, "verified_at": x.VerifiedAt})
	}
	out["workshops"] = workshops
	writeJSON(w, 200, out)
}
func (s *server) createOwnerVehicle(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Plate *string `json:"plate"`
		Make  string  `json:"make"`
		Model string  `json:"model"`
		Year  *int32  `json:"year"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Make = strings.TrimSpace(in.Make)
	in.Model = strings.TrimSpace(in.Model)
	if in.Make == "" || in.Model == "" || (in.Year != nil && (*in.Year < 1886 || *in.Year > 2100)) {
		fail(w, 400, "Marca, modelo o año inválido")
		return
	}
	if in.Plate != nil {
		p := normalizePlate(*in.Plate)
		if p == "" {
			in.Plate = nil
		} else {
			in.Plate = &p
		}
	}
	var v sqlc.Vehicle
	uid := dbUUID(currentUser(r.Context()).ID)
	e := database.WithTx(r.Context(), s.db, func(q *sqlc.Queries) error {
		var err error
		v, err = q.CreateVehicle(r.Context(), sqlc.CreateVehicleParams{OwnerUserID: uid, Status: sqlc.VehicleStatusVinculado, Plate: in.Plate, Make: in.Make, Model: in.Model, Year: in.Year})
		if err != nil {
			return err
		}
		_, err = q.InsertAuditEvent(r.Context(), sqlc.InsertAuditEventParams{ActorUserID: uid, Entity: "vehicle", EntityID: v.ID, Action: "vehicle.create"})
		return err
	})
	if ownerError(w, e) {
		return
	}
	writeJSON(w, 201, ownerBase(v))
}
func (s *server) addOdometer(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Km *int32 `json:"km"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Km == nil || *in.Km < 0 {
		fail(w, 400, "Kilometraje inválido")
		return
	}
	ctx := r.Context()
	uid := dbUUID(currentUser(ctx).ID)
	var reading sqlc.OdometerReading
	var previous *int32
	e := database.WithTx(ctx, s.db, func(q *sqlc.Queries) error {
		v, err := ownerVehicle(q, r)
		if err != nil {
			return err
		}
		rows, err := q.ListOdometerReadingsForOwner(ctx, sqlc.ListOdometerReadingsForOwnerParams{VehicleID: v.ID, OwnerUserID: uid})
		if err != nil {
			return err
		}
		if len(rows) > 0 {
			previous = &rows[0].Km
		}
		reading, err = q.CreateOdometerReading(ctx, sqlc.CreateOdometerReadingParams{VehicleID: v.ID, Km: *in.Km, ReadAt: pgtype.Timestamptz{Time: time.Now(), Valid: true}, Source: sqlc.OdometerSourcePropietario, RecordedBy: uid})
		if err != nil {
			return err
		}
		_, err = q.InsertAuditEvent(ctx, sqlc.InsertAuditEventParams{ActorUserID: uid, Entity: "odometer_reading", EntityID: reading.ID, Action: "odometer.create"})
		return err
	})
	if ownerError(w, e) {
		return
	}
	out := map[string]any{"reading": reading}
	if previous != nil && *in.Km < *previous {
		out["warning"] = fmt.Sprintf("La lectura es menor que la anterior (%d km)", *previous)
	}
	writeJSON(w, 201, out)
}
func (s *server) manualHistory(w http.ResponseWriter, r *http.Request) {
	var in struct {
		PerformedOn  string         `json:"performed_on"`
		OdometerKm   *int32         `json:"odometer_km"`
		Summary      string         `json:"summary"`
		Items        []history.Item `json:"items"`
		Total        *string        `json:"total"`
		WorkshopName *string        `json:"workshop_name_text"`
	}
	if !decode(w, r, &in) {
		return
	}
	date, e := time.Parse("2006-01-02", in.PerformedOn)
	loc, _ := time.LoadLocation("America/El_Salvador")
	now := time.Now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	if e != nil || date.After(today) || strings.TrimSpace(in.Summary) == "" || (in.OdometerKm != nil && *in.OdometerKm < 0) {
		fail(w, 400, "Datos de historial inválidos")
		return
	}
	for _, item := range in.Items {
		if (item.Kind != "trabajo" && item.Kind != "pieza") || strings.TrimSpace(item.Description) == "" || item.InternalCost != nil || item.MechanicNotes != nil {
			fail(w, 400, "Elementos inválidos")
			return
		}
		if item.Price != nil {
			d, err := decimalpkg.NewFromString(*item.Price)
			if err != nil || d.IsNegative() || d.Exponent() < -2 {
				fail(w, 400, "Precio inválido")
				return
			}
		}
	}
	var total pgtype.Numeric
	if in.Total != nil {
		d, err := decimalpkg.NewFromString(*in.Total)
		if err != nil || d.IsNegative() || d.Exponent() < -2 {
			fail(w, 400, "Total inválido")
			return
		}
		total = dbMoney(d)
	}
	if in.Items == nil {
		in.Items = []history.Item{}
	}
	items, _ := json.Marshal(in.Items)
	var notes *string
	if in.WorkshopName != nil && strings.TrimSpace(*in.WorkshopName) != "" {
		n := "Realizado en: " + strings.TrimSpace(*in.WorkshopName)
		notes = &n
	}
	ctx := r.Context()
	uid := dbUUID(currentUser(ctx).ID)
	var rec sqlc.HistoryRecord
	e = database.WithTx(ctx, s.db, func(q *sqlc.Queries) error {
		v, err := ownerVehicle(q, r)
		if err != nil {
			return err
		}
		rec, err = q.CreateHistoryRecord(ctx, sqlc.CreateHistoryRecordParams{VehicleID: v.ID, Source: sqlc.HistorySourcePropietario, PerformedOn: pgtype.Date{Time: date, Valid: true}, OdometerKm: in.OdometerKm, Summary: strings.TrimSpace(in.Summary), Items: items, Total: total, Currency: "USD", WorkshopNotes: notes, CreatedBy: uid})
		if err != nil {
			return err
		}
		if in.OdometerKm != nil {
			_, err = q.CreateOdometerReading(ctx, sqlc.CreateOdometerReadingParams{VehicleID: v.ID, Km: *in.OdometerKm, ReadAt: pgtype.Timestamptz{Time: time.Now(), Valid: true}, Source: sqlc.OdometerSourcePropietario, RecordedBy: uid})
			if err != nil {
				return err
			}
		}
		_, err = q.InsertAuditEvent(ctx, sqlc.InsertAuditEventParams{ActorUserID: uid, Entity: "history_record", EntityID: rec.ID, Action: "history.manual"})
		return err
	})
	if ownerError(w, e) {
		return
	}
	writeJSON(w, 201, map[string]any{"id": uuid.UUID(rec.ID.Bytes)})
}
func (s *server) ownerCorrection(w http.ResponseWriter, r *http.Request) {
	var in struct {
		HistoryRecordID uuid.UUID                  `json:"history_record_id"`
		Reason          string                     `json:"reason"`
		Changes         map[string]json.RawMessage `json:"changes"`
	}
	if !decode(w, r, &in) {
		return
	}
	if strings.TrimSpace(in.Reason) == "" || len(in.Changes) == 0 {
		fail(w, 400, "Corrección inválida")
		return
	}
	for k, raw := range in.Changes {
		valid := false
		switch k {
		case "performed_on":
			var value string
			if json.Unmarshal(raw, &value) == nil {
				date, err := time.Parse("2006-01-02", value)
				loc, _ := time.LoadLocation("America/El_Salvador")
				now := time.Now().In(loc)
				today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
				valid = err == nil && !date.After(today)
			}
		case "odometer_km":
			var value *int32
			valid = json.Unmarshal(raw, &value) == nil && (value == nil || *value >= 0)
		case "summary":
			var value string
			valid = json.Unmarshal(raw, &value) == nil && strings.TrimSpace(value) != ""
		case "items":
			var items []history.Item
			valid = json.Unmarshal(raw, &items) == nil && items != nil
			for _, item := range items {
				if (item.Kind != "trabajo" && item.Kind != "pieza") || strings.TrimSpace(item.Description) == "" || item.InternalCost != nil || item.MechanicNotes != nil {
					valid = false
				}
				if item.Price != nil {
					d, err := decimalpkg.NewFromString(*item.Price)
					if err != nil || d.IsNegative() || d.Exponent() < -2 {
						valid = false
					}
				}
			}
		}
		if !valid {
			fail(w, 400, "Cambio inválido")
			return
		}
	}
	ctx := r.Context()
	uid := dbUUID(currentUser(ctx).ID)
	var correction sqlc.Correction
	e := database.WithTx(ctx, s.db, func(q *sqlc.Queries) error {
		v, err := ownerVehicle(q, r)
		if err != nil {
			return err
		}
		rec, err := q.GetOwnerHistoryRecord(ctx, sqlc.GetOwnerHistoryRecordParams{ID: dbUUID(in.HistoryRecordID), ID_2: v.ID, OwnerUserID: uid})
		if err != nil {
			return err
		}
		if rec.Source != sqlc.HistorySourcePropietario || rec.CreatedBy != uid {
			return errEmail
		}
		data, err := json.Marshal(in.Changes)
		if err != nil {
			return err
		}
		correction, err = q.CreateCorrection(ctx, sqlc.CreateCorrectionParams{HistoryRecordID: rec.ID, Reason: strings.TrimSpace(in.Reason), Changes: data, CreatedBy: uid})
		if err != nil {
			return err
		}
		_, err = q.InsertAuditEvent(ctx, sqlc.InsertAuditEventParams{ActorUserID: uid, Entity: "correction", EntityID: correction.ID, Action: "history.correct"})
		return err
	})
	if errors.Is(e, errEmail) {
		fail(w, 403, "Solo el taller autor puede corregir este registro")
		return
	}
	if ownerError(w, e) {
		return
	}
	writeJSON(w, 201, correction)
}
