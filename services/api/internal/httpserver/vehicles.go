package httpserver

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/values"
)

const invalidVehicle = "Marca, modelo o año inválido"

func vehicleDTO(v sqlc.Vehicle, km *int32) map[string]any {
	return map[string]any{"id": v.ID, "status": v.Status, "plate": v.Plate, "make": v.Make, "model": v.Model, "year": v.Year, "vin": v.Vin, "contact_name": v.ContactName, "contact_phone": v.ContactPhone, "last_odometer_km": km, "last_activity_at": v.LastActivityAt.Time, "created_at": v.CreatedAt.Time}
}

// createProvisionalVehicle is the one way a workshop's vehicle comes into existence.
func createProvisionalVehicle(ctx context.Context, q *sqlc.Queries, wc workshopAccess, p sqlc.CreateVehicleParams) (sqlc.Vehicle, error) {
	p.CreatedByWorkshopID = &wc.workshopID
	p.Status = sqlc.VehicleStatusProvisional
	v, err := q.CreateVehicle(ctx, p)
	if err != nil {
		return v, err
	}
	if err = q.LinkVehicleToWorkshop(ctx, sqlc.LinkVehicleToWorkshopParams{VehicleID: v.ID, WorkshopID: wc.workshopID}); err != nil {
		return v, err
	}
	return v, recordAudit(ctx, q, wc.event("vehicle", v.ID, "vehicle.create"))
}

func (s *server) createVehicle(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	if err := wc.requireWriter(); err != nil {
		return err
	}
	var in struct {
		Plate        *string `json:"plate"`
		Make         string  `json:"make"`
		Model        string  `json:"model"`
		Year         *int32  `json:"year"`
		Vin          *string `json:"vin"`
		ContactName  *string `json:"contact_name"`
		ContactPhone *string `json:"contact_phone"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	in.Make, in.Model = strings.TrimSpace(in.Make), strings.TrimSpace(in.Model)
	if in.Make == "" || in.Model == "" || !values.ValidYear(in.Year) {
		return badRequest(invalidVehicle)
	}
	phone, ok := values.OptionalPhone(in.ContactPhone)
	if !ok {
		return badRequest("Teléfono inválido")
	}
	var v sqlc.Vehicle
	err := s.tx(r.Context(), func(q *sqlc.Queries) error {
		var err error
		v, err = createProvisionalVehicle(r.Context(), q, wc, sqlc.CreateVehicleParams{Plate: values.OptionalPlate(in.Plate), Make: in.Make, Model: in.Model, Year: in.Year, Vin: in.Vin, ContactName: in.ContactName, ContactPhone: phone})
		return err
	})
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, vehicleDTO(v, nil))
	return nil
}

func (s *server) listVehicles(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	includeArchived := false
	if v := r.URL.Query().Get("include_archived"); v != "" {
		parsed, err := strconv.ParseBool(v)
		if err != nil {
			return badRequest("include_archived inválido")
		}
		includeArchived = parsed
	}
	q := sqlc.New(s.db)
	rows, err := q.ListVehiclesForWorkshop(r.Context(), sqlc.ListVehiclesForWorkshopParams{WorkshopID: wc.workshopID, IncludeArchived: includeArchived, PlatePrefix: values.Plate(r.URL.Query().Get("plate"))})
	if err != nil {
		return err
	}
	readings, err := q.ListLatestOdometerForWorkshop(r.Context(), wc.workshopID)
	if err != nil {
		return err
	}
	latest := make(map[uuid.UUID]*int32, len(readings))
	for i := range readings {
		latest[readings[i].VehicleID] = &readings[i].Km
	}
	out := make([]map[string]any, 0, len(rows))
	for _, v := range rows {
		out = append(out, vehicleDTO(v, latest[v.ID]))
	}
	writeJSON(w, http.StatusOK, out)
	return nil
}

func (s *server) getVehicle(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	id, err := pathID(r, "vehicleID", vehicleNotFound)
	if err != nil {
		return err
	}
	ctx := r.Context()
	q := sqlc.New(s.db)
	v, err := q.GetVehicle(ctx, sqlc.GetVehicleParams{ID: id, WorkshopID: wc.workshopID})
	if err != nil {
		return notFoundIfMissing(err, vehicleNotFound)
	}
	var km *int32
	reading, err := q.GetLatestOdometerReading(ctx, sqlc.GetLatestOdometerReadingParams{VehicleID: v.ID, WorkshopID: wc.workshopID})
	if err == nil {
		km = &reading.Km
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	out := vehicleDTO(v, km)
	out["owner_linked"] = v.OwnerUserID != nil
	if v.OwnerUserID != nil {
		owner, err := q.GetUserByID(ctx, *v.OwnerUserID)
		if err != nil {
			return err
		}
		out["owner_name"] = owner.FullName
	}
	writeJSON(w, http.StatusOK, out)
	return nil
}
