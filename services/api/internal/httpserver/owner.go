package httpserver

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/history"
	"kilora/api/internal/values"
)

const maxOwnerReadings = 10

type ownerLastService struct {
	PerformedOn string `json:"performed_on"`
	Summary     string `json:"summary"`
}
type ownerWorkshop struct {
	Name       string     `json:"name"`
	VerifiedAt *time.Time `json:"verified_at"`
}
type ownerReading struct {
	Km     int32               `json:"km"`
	ReadAt time.Time           `json:"read_at"`
	Source sqlc.OdometerSource `json:"source"`
}
type ownerVehicleDTO struct {
	ID               uuid.UUID          `json:"id"`
	Plate            *string            `json:"plate"`
	Make             string             `json:"make"`
	Model            string             `json:"model"`
	Year             *int32             `json:"year"`
	Status           sqlc.VehicleStatus `json:"status"`
	BodyType         *sqlc.BodyType     `json:"body_type"`
	LastOdometerKm   *int32             `json:"last_odometer_km"`
	HistoryCount     *int               `json:"history_count,omitempty"`
	LastService      *ownerLastService  `json:"last_service"`
	OdometerReadings []ownerReading     `json:"odometer_readings,omitempty"`
	Workshops        []ownerWorkshop    `json:"workshops,omitempty"`
}

func ownerBase(v sqlc.Vehicle) ownerVehicleDTO {
	return ownerVehicleDTO{ID: v.ID, Plate: v.Plate, Make: v.Make, Model: v.Model, Year: v.Year, Status: v.Status, BodyType: v.BodyType}
}

func ownedVehicle(ctx context.Context, q *sqlc.Queries, r *http.Request, user uuid.UUID) (sqlc.Vehicle, error) {
	id, err := pathID(r, "vehicleID", vehicleNotFound)
	if err != nil {
		return sqlc.Vehicle{}, err
	}
	v, err := q.GetVehicleForOwner(ctx, sqlc.GetVehicleForOwnerParams{ID: id, OwnerUserID: &user})
	return v, notFoundIfMissing(err, vehicleNotFound)
}

func ownerEvent(user uuid.UUID, entity string, id uuid.UUID, action string) auditEvent {
	return auditEvent{actor: user, entity: entity, id: id, action: action}
}

func ownerVehicleSummary(ctx context.Context, q *sqlc.Queries, v sqlc.Vehicle, user uuid.UUID) (ownerVehicleDTO, []sqlc.OdometerReading, error) {
	out := ownerBase(v)
	readings, err := q.ListOdometerReadingsForOwner(ctx, sqlc.ListOdometerReadingsForOwnerParams{VehicleID: v.ID, OwnerUserID: &user})
	if err != nil {
		return out, nil, err
	}
	if len(readings) > 0 {
		out.LastOdometerKm = &readings[0].Km
	}
	rows, err := q.ListHistoryForOwner(ctx, sqlc.ListHistoryForOwnerParams{VehicleID: v.ID, OwnerUserID: &user})
	if err != nil {
		return out, nil, err
	}
	count := len(rows)
	out.HistoryCount = &count
	if count > 0 {
		out.LastService = &ownerLastService{PerformedOn: rows[0].PerformedOn.Time.Format(values.DateLayout), Summary: rows[0].Summary}
	}
	return out, readings, nil
}

func (s *server) listOwnerVehicles(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	user := currentUser(ctx).ID
	q := sqlc.New(s.db)
	vehicles, err := q.ListVehiclesByOwner(ctx, &user)
	if err != nil {
		return err
	}
	out := []ownerVehicleDTO{}
	for _, v := range vehicles {
		item, _, err := ownerVehicleSummary(ctx, q, v, user)
		if err != nil {
			return err
		}
		out = append(out, item)
	}
	writeJSON(w, http.StatusOK, out)
	return nil
}

func (s *server) getOwnerVehicle(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	user := currentUser(ctx).ID
	q := sqlc.New(s.db)
	v, err := ownedVehicle(ctx, q, r, user)
	if err != nil {
		return err
	}
	out, readings, err := ownerVehicleSummary(ctx, q, v, user)
	if err != nil {
		return err
	}
	if len(readings) > maxOwnerReadings {
		readings = readings[:maxOwnerReadings]
	}
	out.OdometerReadings = make([]ownerReading, 0, len(readings))
	for _, reading := range readings {
		out.OdometerReadings = append(out.OdometerReadings, ownerReading{Km: reading.Km, ReadAt: reading.ReadAt.Time, Source: reading.Source})
	}
	workshops, err := q.ListOwnerWorkshops(ctx, sqlc.ListOwnerWorkshopsParams{ID: v.ID, OwnerUserID: &user})
	if err != nil {
		return err
	}
	out.Workshops = []ownerWorkshop{}
	for _, x := range workshops {
		out.Workshops = append(out.Workshops, ownerWorkshop{Name: x.Name, VerifiedAt: nullableTime(x.VerifiedAt)})
	}
	writeJSON(w, http.StatusOK, out)
	return nil
}

func (s *server) createOwnerVehicle(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Plate    *string        `json:"plate"`
		Make     string         `json:"make"`
		Model    string         `json:"model"`
		Year     *int32         `json:"year"`
		BodyType *sqlc.BodyType `json:"body_type"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	in.Make, in.Model = strings.TrimSpace(in.Make), strings.TrimSpace(in.Model)
	if !values.VehicleText(in.Make) || !values.VehicleText(in.Model) || !values.ValidYear(in.Year) || !values.ValidPlate(in.Plate) {
		return badRequest(invalidVehicle)
	}
	if !validBodyType(in.BodyType) {
		return badRequest(invalidBodyType)
	}
	ctx := r.Context()
	user := currentUser(ctx).ID
	var v sqlc.Vehicle
	err := s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		var err error
		v, err = q.CreateVehicle(ctx, sqlc.CreateVehicleParams{OwnerUserID: &user, Status: sqlc.VehicleStatusVinculado, Plate: values.OptionalPlate(in.Plate), Make: in.Make, Model: in.Model, Year: in.Year, BodyType: in.BodyType})
		return ownerEvent(user, "vehicle", v.ID, "vehicle.create"), err
	})
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, ownerBase(v))
	return nil
}

// setOwnerBodyType deja que el propietario indique (o corrija) el tipo de su vehículo.
func (s *server) setOwnerBodyType(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		BodyType *sqlc.BodyType `json:"body_type"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	if in.BodyType == nil || !in.BodyType.Valid() {
		return badRequest(invalidBodyType)
	}
	ctx := r.Context()
	user := currentUser(ctx).ID
	var v sqlc.Vehicle
	err := s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		current, err := ownedVehicle(ctx, q, r, user)
		if err != nil {
			return auditEvent{}, err
		}
		v, err = q.SetOwnerVehicleBodyType(ctx, sqlc.SetOwnerVehicleBodyTypeParams{BodyType: in.BodyType, ID: current.ID, OwnerUserID: &user})
		return ownerEvent(user, "vehicle", v.ID, "vehicle.body_type"), err
	})
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, ownerBase(v))
	return nil
}

func (s *server) addOdometer(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Km *int32 `json:"km"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	if in.Km == nil || *in.Km < 0 {
		return badRequest("Kilometraje inválido")
	}
	ctx := r.Context()
	user := currentUser(ctx).ID
	var reading sqlc.OdometerReading
	var previous *int32
	err := s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		v, err := ownedVehicle(ctx, q, r, user)
		if err != nil {
			return auditEvent{}, err
		}
		rows, err := q.ListOdometerReadingsForOwner(ctx, sqlc.ListOdometerReadingsForOwnerParams{VehicleID: v.ID, OwnerUserID: &user})
		if err != nil {
			return auditEvent{}, err
		}
		if len(rows) > 0 {
			previous = &rows[0].Km
		}
		reading, err = q.CreateOdometerReading(ctx, sqlc.CreateOdometerReadingParams{VehicleID: v.ID, Km: *in.Km, ReadAt: timestamptz(time.Now()), Source: sqlc.OdometerSourcePropietario, RecordedBy: &user})
		return ownerEvent(user, "odometer_reading", reading.ID, "odometer.create"), err
	})
	if err != nil {
		return err
	}
	out := map[string]any{"reading": reading}
	if previous != nil && *in.Km < *previous {
		out["warning"] = fmt.Sprintf("La lectura es menor que la anterior (%d km)", *previous)
	}
	writeJSON(w, http.StatusCreated, out)
	return nil
}

func validManualItems(items []history.Item, itemErr, priceErr error) error {
	for _, item := range items {
		if (item.Kind != "trabajo" && item.Kind != "pieza") || strings.TrimSpace(item.Description) == "" || item.InternalCost != nil || item.MechanicNotes != nil {
			return itemErr
		}
		if item.Price != nil {
			if _, ok := values.Money(*item.Price); !ok {
				return priceErr
			}
		}
	}
	return nil
}

func (s *server) manualHistory(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		PerformedOn  string         `json:"performed_on"`
		OdometerKm   *int32         `json:"odometer_km"`
		Summary      string         `json:"summary"`
		Items        []history.Item `json:"items"`
		Total        *string        `json:"total"`
		WorkshopName *string        `json:"workshop_name_text"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	performed, ok := values.PastDate(in.PerformedOn)
	in.Summary = strings.TrimSpace(in.Summary)
	if !ok || in.Summary == "" || (in.OdometerKm != nil && *in.OdometerKm < 0) {
		return badRequest("Datos de historial inválidos")
	}
	if err := validManualItems(in.Items, badRequest("Elementos inválidos"), badRequest("Precio inválido")); err != nil {
		return err
	}
	var total pgtype.Numeric
	if in.Total != nil {
		d, ok := values.Money(*in.Total)
		if !ok {
			return badRequest("Total inválido")
		}
		total = dbNumeric(d)
	}
	if in.Items == nil {
		in.Items = []history.Item{}
	}
	items, err := json.Marshal(in.Items)
	if err != nil {
		return err
	}
	var notes *string
	if name := values.OptionalText(in.WorkshopName); name != nil {
		text := "Realizado en: " + *name
		notes = &text
	}
	ctx := r.Context()
	user := currentUser(ctx).ID
	var rec sqlc.HistoryRecord
	err = s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		v, err := ownedVehicle(ctx, q, r, user)
		if err != nil {
			return auditEvent{}, err
		}
		rec, err = q.CreateHistoryRecord(ctx, sqlc.CreateHistoryRecordParams{VehicleID: v.ID, Source: sqlc.HistorySourcePropietario, PerformedOn: date(performed), OdometerKm: in.OdometerKm, Summary: in.Summary, Items: items, Total: total, Currency: values.Currency, WorkshopNotes: notes, CreatedBy: &user})
		if err != nil {
			return auditEvent{}, err
		}
		if in.OdometerKm != nil {
			if _, err = q.CreateOdometerReading(ctx, sqlc.CreateOdometerReadingParams{VehicleID: v.ID, Km: *in.OdometerKm, ReadAt: timestamptz(time.Now()), Source: sqlc.OdometerSourcePropietario, RecordedBy: &user}); err != nil {
				return auditEvent{}, err
			}
		}
		return ownerEvent(user, "history_record", rec.ID, "history.manual"), nil
	})
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": rec.ID})
	return nil
}

func validCorrectionChange(key string, raw json.RawMessage) bool {
	switch key {
	case "performed_on":
		var value string
		if json.Unmarshal(raw, &value) != nil {
			return false
		}
		_, ok := values.PastDate(value)
		return ok
	case "odometer_km":
		var value *int32
		return json.Unmarshal(raw, &value) == nil && (value == nil || *value >= 0)
	case "summary":
		var value string
		return json.Unmarshal(raw, &value) == nil && strings.TrimSpace(value) != ""
	case "items":
		var items []history.Item
		invalid := badRequest("")
		return json.Unmarshal(raw, &items) == nil && items != nil && validManualItems(items, invalid, invalid) == nil
	}
	return false
}

func (s *server) ownerCorrection(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		HistoryRecordID uuid.UUID                  `json:"history_record_id"`
		Reason          string                     `json:"reason"`
		Changes         map[string]json.RawMessage `json:"changes"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	in.Reason = strings.TrimSpace(in.Reason)
	if in.Reason == "" || len(in.Changes) == 0 {
		return badRequest("Corrección inválida")
	}
	for key, raw := range in.Changes {
		if !validCorrectionChange(key, raw) {
			return badRequest("Cambio inválido")
		}
	}
	data, err := json.Marshal(in.Changes)
	if err != nil {
		return err
	}
	ctx := r.Context()
	user := currentUser(ctx).ID
	var correction sqlc.Correction
	err = s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		v, err := ownedVehicle(ctx, q, r, user)
		if err != nil {
			return auditEvent{}, err
		}
		rec, err := q.GetOwnerHistoryRecord(ctx, sqlc.GetOwnerHistoryRecordParams{ID: in.HistoryRecordID, ID_2: v.ID, OwnerUserID: &user})
		if err != nil {
			return auditEvent{}, notFoundIfMissing(err, "Registro no encontrado")
		}
		if rec.Source != sqlc.HistorySourcePropietario || rec.CreatedBy == nil || *rec.CreatedBy != user {
			return auditEvent{}, forbidden("Solo el taller autor puede corregir este registro")
		}
		correction, err = q.CreateCorrection(ctx, sqlc.CreateCorrectionParams{HistoryRecordID: rec.ID, Reason: in.Reason, Changes: data, CreatedBy: user})
		return ownerEvent(user, "correction", correction.ID, "history.correct"), err
	})
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, correction)
	return nil
}
