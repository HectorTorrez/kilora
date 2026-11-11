package httpserver

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"unicode"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/values"
)

const (
	customerNotFound = "Cliente no encontrado"
	customerRequired = "Indicá el cliente del vehículo (nombre y teléfono)"
)

// customerRef is the slice of a customer that travels with each vehicle.
type customerRef struct {
	ID       uuid.UUID `json:"id"`
	FullName string    `json:"full_name"`
	Phone    *string   `json:"phone"`
	Email    *string   `json:"email,omitempty"`
}

func refOf(c sqlc.Customer) *customerRef {
	return &customerRef{ID: c.ID, FullName: c.FullName, Phone: c.Phone, Email: c.Email}
}

func refFromColumns(id *uuid.UUID, name, phone *string) *customerRef {
	if id == nil || name == nil {
		return nil
	}
	return &customerRef{ID: *id, FullName: *name, Phone: phone}
}

func customerDTO(c sqlc.Customer) map[string]any {
	return map[string]any{"id": c.ID, "full_name": c.FullName, "phone": c.Phone, "email": c.Email, "has_account": c.UserID != nil, "created_at": c.CreatedAt.Time, "updated_at": c.UpdatedAt.Time}
}

type customerInput struct {
	FullName string  `json:"full_name"`
	Phone    string  `json:"phone"`
	Email    *string `json:"email"`
}

type customerFields struct {
	name, phone string
	email       *string
}

func parseCustomer(in customerInput) (customerFields, error) {
	f := customerFields{name: strings.Join(strings.Fields(in.FullName), " ")}
	if !values.PersonName(f.name) {
		return f, badRequest("Nombre del cliente inválido: usá letras, espacios, apóstrofos o guiones (2 a 100 caracteres)")
	}
	phone, ok := values.Phone(in.Phone)
	if !ok {
		return f, badRequest("Teléfono del cliente inválido")
	}
	f.phone = phone
	if e := values.OptionalText(in.Email); e != nil {
		email, ok := values.Email(*e)
		if !ok {
			return f, badRequest("Correo del cliente inválido")
		}
		f.email = &email
	}
	return f, nil
}

// customerChoice is how a form points at a customer: an existing one or a new one.
type customerChoice struct {
	CustomerID *uuid.UUID     `json:"customer_id"`
	Customer   *customerInput `json:"customer"`
}

func (c customerChoice) empty() bool {
	return (c.CustomerID == nil || *c.CustomerID == uuid.Nil) && c.Customer == nil
}

func phoneTaken(existing sqlc.Customer) error {
	return conflict(fmt.Sprintf("Ya existe un cliente con ese teléfono: %s", existing.FullName))
}

// insertCustomer creates a customer, refusing a phone that already belongs to another one.
func insertCustomer(ctx context.Context, q *sqlc.Queries, wc workshopAccess, f customerFields) (sqlc.Customer, error) {
	if existing, err := q.GetCustomerByPhone(ctx, sqlc.GetCustomerByPhoneParams{WorkshopID: wc.workshopID, Phone: &f.phone}); err == nil {
		return existing, phoneTaken(existing)
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return existing, err
	}
	c, err := q.CreateCustomer(ctx, sqlc.CreateCustomerParams{WorkshopID: wc.workshopID, FullName: f.name, Phone: &f.phone, Email: f.email})
	if isUniqueViolation(err) {
		return c, conflict("Ya existe un cliente con ese teléfono")
	}
	if err != nil {
		return c, err
	}
	return c, recordAudit(ctx, q, wc.event("customer", c.ID, "customer.create"))
}

// resolveCustomer turns a form's choice into a customer of this workshop.
func resolveCustomer(ctx context.Context, q *sqlc.Queries, wc workshopAccess, choice customerChoice) (sqlc.Customer, error) {
	if choice.CustomerID != nil && *choice.CustomerID != uuid.Nil {
		c, err := q.GetCustomer(ctx, sqlc.GetCustomerParams{ID: *choice.CustomerID, WorkshopID: wc.workshopID})
		return c, notFoundIfMissing(err, customerNotFound)
	}
	if choice.Customer == nil {
		return sqlc.Customer{}, badRequest(customerRequired)
	}
	f, err := parseCustomer(*choice.Customer)
	if err != nil {
		return sqlc.Customer{}, err
	}
	return insertCustomer(ctx, q, wc, f)
}

// findOrCreateCustomer reuses the workshop's customer with that phone, used when the
// phone is the only identity at hand (a counter quote turning into an order).
func findOrCreateCustomer(ctx context.Context, q *sqlc.Queries, wc workshopAccess, name, phone string) (sqlc.Customer, error) {
	c, err := q.GetCustomerByPhone(ctx, sqlc.GetCustomerByPhoneParams{WorkshopID: wc.workshopID, Phone: &phone})
	if err == nil || !errors.Is(err, pgx.ErrNoRows) {
		return c, err
	}
	name = strings.Join(strings.Fields(name), " ")
	if !values.PersonName(name) {
		return c, badRequest("Nombre del cliente inválido: corregilo en la cotización antes de convertirla")
	}
	return insertCustomer(ctx, q, wc, customerFields{name: name, phone: phone})
}

func normalizedSearch(raw string) *string {
	return searchPattern(strings.Map(func(r rune) rune {
		if r == '-' || unicode.IsSpace(r) {
			return -1
		}
		return unicode.ToLower(r)
	}, strings.TrimSpace(raw)))
}

func (s *server) listCustomersPage(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	limit, offset, err := pageWindow(r)
	if err != nil {
		return err
	}
	search := normalizedSearch(r.URL.Query().Get("q"))
	q := sqlc.New(s.db)
	total, err := q.CountCustomers(r.Context(), sqlc.CountCustomersParams{WorkshopID: wc.workshopID, Search: search})
	if err != nil {
		return err
	}
	rows, err := q.ListCustomersPage(r.Context(), sqlc.ListCustomersPageParams{WorkshopID: wc.workshopID, Search: search, RowLimit: limit, RowOffset: offset})
	if err != nil {
		return err
	}
	items := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		item := customerDTO(sqlc.Customer{ID: row.ID, WorkshopID: row.WorkshopID, FullName: row.FullName, Phone: row.Phone, Email: row.Email, UserID: row.UserID, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt})
		item["vehicle_count"] = row.VehicleCount
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": total})
	return nil
}

func (s *server) createCustomer(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	if err := wc.requireWriter(); err != nil {
		return err
	}
	var in customerInput
	if err := decode(r, &in); err != nil {
		return err
	}
	f, err := parseCustomer(in)
	if err != nil {
		return err
	}
	var c sqlc.Customer
	err = s.tx(r.Context(), func(q *sqlc.Queries) error {
		var err error
		c, err = insertCustomer(r.Context(), q, wc, f)
		return err
	})
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, customerDTO(c))
	return nil
}

func (s *server) getCustomer(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	id, err := pathID(r, "customerID", customerNotFound)
	if err != nil {
		return err
	}
	ctx := r.Context()
	q := sqlc.New(s.db)
	c, err := q.GetCustomer(ctx, sqlc.GetCustomerParams{ID: id, WorkshopID: wc.workshopID})
	if err != nil {
		return notFoundIfMissing(err, customerNotFound)
	}
	vehicles, err := q.ListCustomerVehicles(ctx, sqlc.ListCustomerVehiclesParams{WorkshopID: wc.workshopID, CustomerID: &c.ID})
	if err != nil {
		return err
	}
	ids := make([]uuid.UUID, 0, len(vehicles))
	for _, v := range vehicles {
		ids = append(ids, v.ID)
	}
	readings, err := q.ListLatestOdometerForVehicles(ctx, sqlc.ListLatestOdometerForVehiclesParams{WorkshopID: wc.workshopID, VehicleIds: ids})
	if err != nil {
		return err
	}
	latest := make(map[uuid.UUID]*int32, len(readings))
	for i := range readings {
		latest[readings[i].VehicleID] = &readings[i].Km
	}
	ref := refOf(c)
	list := make([]map[string]any, 0, len(vehicles))
	for _, v := range vehicles {
		list = append(list, vehicleDTO(v, latest[v.ID], ref))
	}
	out := customerDTO(c)
	out["vehicles"] = list
	writeJSON(w, http.StatusOK, out)
	return nil
}

func (s *server) updateCustomer(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	if err := wc.requireWriter(); err != nil {
		return err
	}
	id, err := pathID(r, "customerID", customerNotFound)
	if err != nil {
		return err
	}
	var in customerInput
	if err = decode(r, &in); err != nil {
		return err
	}
	f, err := parseCustomer(in)
	if err != nil {
		return err
	}
	ctx := r.Context()
	var c sqlc.Customer
	err = s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		existing, err := q.GetCustomerByPhone(ctx, sqlc.GetCustomerByPhoneParams{WorkshopID: wc.workshopID, Phone: &f.phone})
		if err == nil && existing.ID != id {
			return auditEvent{}, phoneTaken(existing)
		} else if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return auditEvent{}, err
		}
		c, err = q.UpdateCustomer(ctx, sqlc.UpdateCustomerParams{FullName: f.name, Phone: &f.phone, Email: f.email, ID: id, WorkshopID: wc.workshopID})
		if isUniqueViolation(err) {
			return auditEvent{}, conflict("Ya existe un cliente con ese teléfono")
		}
		if err != nil {
			return auditEvent{}, notFoundIfMissing(err, customerNotFound)
		}
		return wc.event("customer", c.ID, "customer.update"), nil
	})
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, customerDTO(c))
	return nil
}

func (s *server) setVehicleCustomer(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	if err := wc.requireWriter(); err != nil {
		return err
	}
	id, err := pathID(r, "vehicleID", vehicleNotFound)
	if err != nil {
		return err
	}
	var in customerChoice
	if err = decode(r, &in); err != nil {
		return err
	}
	if in.empty() {
		return badRequest(customerRequired)
	}
	ctx := r.Context()
	var c sqlc.Customer
	err = s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		if _, err := q.GetVehicle(ctx, sqlc.GetVehicleParams{ID: id, WorkshopID: wc.workshopID}); err != nil {
			return auditEvent{}, notFoundIfMissing(err, vehicleNotFound)
		}
		var err error
		if c, err = resolveCustomer(ctx, q, wc, in); err != nil {
			return auditEvent{}, err
		}
		if _, err = q.SetVehicleCustomer(ctx, sqlc.SetVehicleCustomerParams{CustomerID: &c.ID, VehicleID: id, WorkshopID: wc.workshopID}); err != nil {
			return auditEvent{}, err
		}
		return wc.event("vehicle", id, "vehicle.customer.set"), nil
	})
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, customerDTO(c))
	return nil
}

// vehicleCustomer returns this workshop's customer for the vehicle, or nil when none.
func vehicleCustomer(ctx context.Context, q *sqlc.Queries, vehicleID, workshopID uuid.UUID) (*sqlc.Customer, error) {
	c, err := q.GetVehicleCustomer(ctx, sqlc.GetVehicleCustomerParams{VehicleID: vehicleID, WorkshopID: workshopID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}
