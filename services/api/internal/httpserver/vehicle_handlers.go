package httpserver

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"unicode"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"kilora/api/internal/database"
	"kilora/api/internal/database/sqlc"
)

func normalizePlate(s string) string {
	return strings.ToUpper(strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) || r == '-' {
			return -1
		}
		return r
	}, s))
}
func normalizePhone(s string) (string, bool) {
	s = strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) || r == '-' {
			return -1
		}
		return r
	}, s)
	if strings.HasPrefix(s, "+503") {
		s = s[4:]
	} else if strings.HasPrefix(s, "503") && len(s) == 11 {
		s = s[3:]
	}
	if len(s) != 8 {
		return "", false
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return "", false
		}
	}
	return "+503" + s, true
}
func writeAllowed(w http.ResponseWriter, wc WorkshopContext) bool {
	if wc.Role == "mecanico" {
		fail(w, 403, "Acceso denegado")
		return false
	}
	return true
}
func vehicleDTO(v sqlc.Vehicle, km *int32) map[string]any {
	return map[string]any{"id": uuid.UUID(v.ID.Bytes), "status": v.Status, "plate": v.Plate, "make": v.Make, "model": v.Model, "year": v.Year, "vin": v.Vin, "contact_name": v.ContactName, "contact_phone": v.ContactPhone, "last_odometer_km": km, "last_activity_at": v.LastActivityAt.Time, "created_at": v.CreatedAt.Time}
}
func (s *server) createVehicle(w http.ResponseWriter, r *http.Request) {
	wc, _ := CurrentWorkshop(r.Context())
	if !writeAllowed(w, wc) {
		return
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
	if in.ContactPhone != nil {
		p, ok := normalizePhone(*in.ContactPhone)
		if !ok {
			fail(w, 400, "Teléfono inválido")
			return
		}
		in.ContactPhone = &p
	}
	var v sqlc.Vehicle
	err := database.WithTx(r.Context(), s.db, func(q *sqlc.Queries) error {
		var err error
		v, err = q.CreateVehicle(r.Context(), sqlc.CreateVehicleParams{CreatedByWorkshopID: dbUUID(wc.WorkshopID), Status: sqlc.VehicleStatusProvisional, Plate: in.Plate, Make: in.Make, Model: in.Model, Year: in.Year, Vin: in.Vin, ContactName: in.ContactName, ContactPhone: in.ContactPhone})
		if err != nil {
			return err
		}
		if err = q.LinkVehicleToWorkshop(r.Context(), sqlc.LinkVehicleToWorkshopParams{VehicleID: v.ID, WorkshopID: dbUUID(wc.WorkshopID)}); err != nil {
			return err
		}
		_, err = q.InsertAuditEvent(r.Context(), sqlc.InsertAuditEventParams{ActorUserID: dbUUID(wc.UserID), WorkshopID: dbUUID(wc.WorkshopID), Entity: "vehicle", EntityID: v.ID, Action: "vehicle.create"})
		return err
	})
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	writeJSON(w, 201, vehicleDTO(v, nil))
}
func (s *server) vehicleWithKM(ctx context.Context, wc WorkshopContext, v sqlc.Vehicle) (map[string]any, error) {
	reading, err := sqlc.New(s.db).GetLatestOdometerReading(ctx, sqlc.GetLatestOdometerReadingParams{VehicleID: v.ID, WorkshopID: dbUUID(wc.WorkshopID)})
	var km *int32
	if err == nil {
		km = &reading.Km
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	return vehicleDTO(v, km), nil
}
func (s *server) listVehicles(w http.ResponseWriter, r *http.Request) {
	wc, _ := CurrentWorkshop(r.Context())
	include := false
	var err error
	if v := r.URL.Query().Get("include_archived"); v != "" {
		include, err = strconv.ParseBool(v)
		if err != nil {
			fail(w, 400, "include_archived inválido")
			return
		}
	}
	rows, err := sqlc.New(s.db).ListVehiclesForWorkshop(r.Context(), sqlc.ListVehiclesForWorkshopParams{WorkshopID: dbUUID(wc.WorkshopID), IncludeArchived: &include})
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	prefix := normalizePlate(r.URL.Query().Get("plate"))
	out := []map[string]any{}
	for _, v := range rows {
		if prefix != "" && (v.Plate == nil || !strings.HasPrefix(*v.Plate, prefix)) {
			continue
		}
		item, e := s.vehicleWithKM(r.Context(), wc, v)
		if e != nil {
			fail(w, 500, "Error interno")
			return
		}
		out = append(out, item)
	}
	writeJSON(w, 200, out)
}
func (s *server) getVehicle(w http.ResponseWriter, r *http.Request) {
	wc, _ := CurrentWorkshop(r.Context())
	id, err := uuid.Parse(chi.URLParam(r, "vehicleID"))
	if err != nil {
		fail(w, 404, "Vehículo no encontrado")
		return
	}
	v, err := sqlc.New(s.db).GetVehicle(r.Context(), sqlc.GetVehicleParams{ID: dbUUID(id), WorkshopID: dbUUID(wc.WorkshopID)})
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 404, "Vehículo no encontrado")
		return
	}
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	out, err := s.vehicleWithKM(r.Context(), wc, v)
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	out["owner_linked"] = v.OwnerUserID.Valid
	if v.OwnerUserID.Valid {
		owner, e := sqlc.New(s.db).GetUserByID(r.Context(), v.OwnerUserID)
		if e != nil {
			fail(w, 500, "Error interno")
			return
		}
		out["owner_name"] = owner.FullName
	}
	writeJSON(w, 200, out)
}
