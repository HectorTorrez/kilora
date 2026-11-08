package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/shopspring/decimal"
	"kilora/api/internal/auth"
	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/values"
)

const (
	quoteNotFound         = "Cotización no encontrada"
	quoteAlreadyConverted = "La cotización ya fue convertida en orden"
	quoteHasOutcome       = "La cotización ya tiene resultado"
	defaultQuoteValidDays = 15
	vehicleNotFound       = "Vehículo no encontrado"
)

var errInvalidOutcome = badRequest("Resultado inválido")

type quoteInputItem struct {
	Kind        sqlc.QuoteItemKind `json:"kind"`
	Description string             `json:"description"`
	Quantity    json.RawMessage    `json:"quantity"`
	UnitPrice   json.RawMessage    `json:"unit_price"`
}

type parsedQuoteItem struct {
	kind            sqlc.QuoteItemKind
	description     string
	quantity, price pgtype.Numeric
}

func parseQuoteItems(raw []quoteInputItem) ([]parsedQuoteItem, pgtype.Numeric, error) {
	if len(raw) == 0 {
		return nil, pgtype.Numeric{}, badRequest("Agrega al menos un ítem")
	}
	items := make([]parsedQuoteItem, 0, len(raw))
	total := decimal.Zero
	for _, v := range raw {
		quantity, okQuantity := requiredQuantity(v.Quantity)
		price, okPrice := requiredMoney(v.UnitPrice)
		description := strings.TrimSpace(v.Description)
		if !okQuantity || !okPrice || description == "" || !v.Kind.Valid() {
			return nil, pgtype.Numeric{}, badRequest("Datos de cotización inválidos")
		}
		total = total.Add(values.LineTotal(amount(quantity), amount(price)))
		items = append(items, parsedQuoteItem{v.Kind, description, quantity, price})
	}
	return items, dbNumeric(total), nil
}

func replaceQuoteItems(ctx context.Context, q *sqlc.Queries, id uuid.UUID, items []parsedQuoteItem) error {
	if err := q.DeleteQuoteItems(ctx, id); err != nil {
		return err
	}
	for i, v := range items {
		if err := q.CreateQuoteItem(ctx, sqlc.CreateQuoteItemParams{QuoteID: id, Position: int32(i), Kind: v.kind, Description: v.description, Quantity: v.quantity, UnitPrice: v.price}); err != nil {
			return err
		}
	}
	return nil
}

func quoteItemsJSON(rows []sqlc.ListQuoteItemsRow) []any {
	items := []any{}
	for _, v := range rows {
		items = append(items, map[string]any{"kind": v.Kind, "description": v.Description, "quantity": v.Quantity, "unit_price": v.UnitPrice})
	}
	return items
}

func parseOutcome(v sqlc.QuoteOutcome) error {
	if v == sqlc.QuoteOutcomePendiente || !v.Valid() {
		return errInvalidOutcome
	}
	return nil
}

func (s *server) webURL(path string) string { return strings.TrimRight(s.origin, "/") + path }

func whatsAppURL(phone *string, text string) string {
	number := ""
	if phone != nil {
		number = strings.TrimPrefix(*phone, "+")
	}
	return "https://wa.me/" + number + "?text=" + url.QueryEscape(text)
}

func (s *server) quoteShareResponse(workshop, vehicle, total, token string, expires time.Time, phone *string) map[string]any {
	link := s.webURL("/c/" + token)
	text := fmt.Sprintf("Cotización de %s para %s: $%s. Consulta el detalle: %s", workshop, vehicle, total, link)
	return map[string]any{"url": link, "expires_at": expires, "whatsapp_url": whatsAppURL(phone, text)}
}

type quoteDTO struct {
	Items          []any             `json:"items"`
	Total          string            `json:"total"`
	Currency       string            `json:"currency"`
	Outcome        sqlc.QuoteOutcome `json:"outcome"`
	OutcomeAt      *time.Time        `json:"outcome_at"`
	OutcomeBy      *uuid.UUID        `json:"outcome_by"`
	SharedAt       *time.Time        `json:"shared_at"`
	ShareExpiresAt *time.Time        `json:"share_expires_at"`
}

func (s *server) loadQuote(ctx context.Context, id uuid.UUID) (quoteDTO, error) {
	q := sqlc.New(s.db)
	data, err := q.GetQuoteData(ctx, id)
	if err != nil {
		return quoteDTO{}, err
	}
	rows, err := q.ListQuoteItems(ctx, id)
	if err != nil {
		return quoteDTO{}, err
	}
	return quoteDTO{Items: quoteItemsJSON(rows), Total: data.Total, Currency: data.Currency, Outcome: data.Outcome, OutcomeAt: nullableTime(data.OutcomeAt), OutcomeBy: data.OutcomeBy, SharedAt: nullableTime(data.SharedAt), ShareExpiresAt: nullableTime(data.ShareExpiresAt)}, nil
}

func orderQuoteNumber(ctx context.Context, q *sqlc.Queries, o sqlc.WorkOrder) (int32, error) {
	meta, err := q.GetOrderQuoteMeta(ctx, sqlc.GetOrderQuoteMetaParams{WorkOrderID: &o.ID, WorkshopID: o.WorkshopID})
	if errors.Is(err, pgx.ErrNoRows) {
		return q.NextQuoteNumber(ctx, o.WorkshopID)
	}
	return meta.Number, err
}

func (s *server) writableOrder(r *http.Request, wc workshopAccess) (sqlc.WorkOrder, error) {
	o, err := s.findOrder(r.Context(), r, wc)
	if err != nil {
		return o, err
	}
	return o, wc.requireBranchWriter(o.BranchID)
}

func (s *server) saveQuote(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	o, err := s.writableOrder(r, wc)
	if err != nil {
		return err
	}
	var in struct {
		Items []quoteInputItem `json:"items"`
	}
	if err = decode(r, &in); err != nil {
		return err
	}
	items, total, err := parseQuoteItems(in.Items)
	if err != nil {
		return err
	}
	ctx := r.Context()
	err = retryNumbered(func() error {
		return s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
			if _, err := q.LockWorkOrder(ctx, sqlc.LockWorkOrderParams{ID: o.ID, WorkshopID: o.WorkshopID}); err != nil {
				return auditEvent{}, err
			}
			number, err := orderQuoteNumber(ctx, q, o)
			if err != nil {
				return auditEvent{}, err
			}
			quote, err := q.UpsertQuote(ctx, sqlc.UpsertQuoteParams{WorkOrderID: &o.ID, WorkshopID: o.WorkshopID, BranchID: o.BranchID, Number: number, Total: total, CreatedBy: wc.userID})
			if errors.Is(err, pgx.ErrNoRows) {
				return auditEvent{}, conflict(quoteHasOutcome)
			}
			if err != nil {
				return auditEvent{}, err
			}
			if err = replaceQuoteItems(ctx, q, quote.ID, items); err != nil {
				return auditEvent{}, err
			}
			return wc.event("quote", quote.ID, "quote.save"), nil
		})
	})
	if err != nil {
		return err
	}
	return s.writeOrderQuote(w, r, o)
}

func (s *server) writeOrderQuote(w http.ResponseWriter, r *http.Request, o sqlc.WorkOrder) error {
	meta, err := sqlc.New(s.db).GetOrderQuoteMeta(r.Context(), sqlc.GetOrderQuoteMetaParams{WorkOrderID: &o.ID, WorkshopID: o.WorkshopID})
	if err != nil {
		return notFoundIfMissing(err, quoteNotFound)
	}
	v, err := s.loadQuote(r.Context(), meta.ID)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, v)
	return nil
}

func (s *server) getQuote(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	o, err := s.findOrder(r.Context(), r, wc)
	if err != nil {
		return err
	}
	return s.writeOrderQuote(w, r, o)
}

func (s *server) shareQuote(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	o, err := s.writableOrder(r, wc)
	if err != nil {
		return err
	}
	token, hash, err := auth.NewTokenPair()
	if err != nil {
		return err
	}
	ctx := r.Context()
	var shared sqlc.ShareQuoteRow
	var contact sqlc.GetQuoteContactRow
	err = s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		var err error
		shared, err = q.ShareQuote(ctx, sqlc.ShareQuoteParams{ShareTokenHash: &hash, WorkOrderID: &o.ID, WorkshopID: o.WorkshopID})
		if err != nil {
			return auditEvent{}, notFoundIfMissing(err, quoteNotFound)
		}
		contact, err = q.GetQuoteContact(ctx, o.ID)
		return wc.event("quote", shared.ID, "quote.share"), err
	})
	if err != nil {
		return err
	}
	vehicle := "sin placa"
	if contact.Plate != nil {
		vehicle = *contact.Plate
	}
	writeJSON(w, http.StatusOK, s.quoteShareResponse(contact.Name, vehicle, shared.Total, token, shared.ShareExpiresAt.Time, contact.ContactPhone))
	return nil
}

func (s *server) quoteOutcome(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	o, err := s.writableOrder(r, wc)
	if err != nil {
		return err
	}
	var in struct {
		Outcome sqlc.QuoteOutcome `json:"outcome"`
	}
	if err = decode(r, &in); err != nil {
		return err
	}
	if err = parseOutcome(in.Outcome); err != nil {
		return err
	}
	ctx := r.Context()
	err = s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		id, err := q.SetQuoteOutcome(ctx, sqlc.SetQuoteOutcomeParams{Outcome: in.Outcome, OutcomeBy: &wc.userID, WorkOrderID: &o.ID, WorkshopID: o.WorkshopID})
		if errors.Is(err, pgx.ErrNoRows) {
			_, metaErr := q.GetOrderQuoteMeta(ctx, sqlc.GetOrderQuoteMetaParams{WorkOrderID: &o.ID, WorkshopID: o.WorkshopID})
			if metaErr == nil {
				return auditEvent{}, conflict(quoteAlreadyConverted)
			}
			return auditEvent{}, notFoundIfMissing(metaErr, quoteNotFound)
		}
		return wc.event("quote", id, "quote.outcome"), err
	})
	if err != nil {
		return err
	}
	return s.writeOrderQuote(w, r, o)
}

func (s *server) publicQuote(w http.ResponseWriter, r *http.Request) error {
	if err := s.limitPublicRead(r, "quote"); err != nil {
		return err
	}
	ctx := r.Context()
	hash := auth.HashToken(pathToken(r))
	public, err := sqlc.New(s.db).GetPublicQuote(ctx, &hash)
	if err != nil {
		return notFoundIfMissing(err, "Cotización no disponible")
	}
	v, err := s.loadQuote(ctx, public.ID)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, map[string]any{"workshop_name": public.Name, "verified_at": nullableTime(public.VerifiedAt), "plate": public.Plate, "make": public.Make, "model": public.Model, "year": public.Year, "order_number": public.OrderNumber, "quote_number": public.QuoteNumber, "customer_name": public.CustomerName, "notes": public.Notes, "valid_until": nullableDate(public.ValidUntil), "items": v.Items, "total": v.Total, "currency": v.Currency, "shared_at": nullableTime(public.SharedAt), "share_expires_at": nullableTime(public.ShareExpiresAt)})
	return nil
}

type counterQuoteBody struct {
	CustomerName  string           `json:"customer_name"`
	CustomerPhone *string          `json:"customer_phone"`
	VehicleID     *uuid.UUID       `json:"vehicle_id"`
	VehicleMake   *string          `json:"vehicle_make"`
	VehicleModel  string           `json:"vehicle_model"`
	VehicleYear   *int32           `json:"vehicle_year"`
	VehiclePlate  *string          `json:"vehicle_plate"`
	BranchID      uuid.UUID        `json:"branch_id"`
	Notes         *string          `json:"notes"`
	ValidDays     *int             `json:"valid_days"`
	Items         []quoteInputItem `json:"items"`
}

type counterDraft struct {
	name, model                   string
	makeName, phone, plate, notes *string
	year                          *int32
	vehicle                       *uuid.UUID
	branch                        uuid.UUID
	until                         pgtype.Date
	items                         []parsedQuoteItem
	total                         pgtype.Numeric
}

func parseCounterQuote(in counterQuoteBody) (counterDraft, error) {
	d := counterDraft{name: strings.TrimSpace(in.CustomerName), model: strings.TrimSpace(in.VehicleModel), makeName: values.OptionalText(in.VehicleMake), plate: values.OptionalPlate(in.VehiclePlate), notes: values.OptionalText(in.Notes), year: in.VehicleYear, branch: in.BranchID}
	if d.name == "" {
		return d, badRequest("Nombre del cliente obligatorio")
	}
	if d.model == "" {
		return d, badRequest("Modelo del vehículo obligatorio")
	}
	phone, ok := values.OptionalPhone(in.CustomerPhone)
	if !ok {
		return d, badRequest("Teléfono inválido")
	}
	d.phone = phone
	if !values.ValidYear(in.VehicleYear) {
		return d, badRequest("Año inválido")
	}
	if in.BranchID == uuid.Nil {
		return d, badRequest("Sucursal inválida")
	}
	if in.VehicleID != nil && *in.VehicleID != uuid.Nil {
		d.vehicle = in.VehicleID
	}
	days := defaultQuoteValidDays
	if in.ValidDays != nil {
		days = *in.ValidDays
		if days < 1 || days > 365 {
			return d, badRequest("Vigencia inválida")
		}
	}
	d.until = date(values.Today().AddDate(0, 0, days))
	var err error
	d.items, d.total, err = parseQuoteItems(in.Items)
	return d, err
}

func requireLinkedVehicle(ctx context.Context, q *sqlc.Queries, wc workshopAccess, id *uuid.UUID) error {
	if id == nil {
		return nil
	}
	_, err := q.GetVehicle(ctx, sqlc.GetVehicleParams{ID: *id, WorkshopID: wc.workshopID})
	return notFoundIfMissing(err, vehicleNotFound)
}

func counterQuoteJSON(row sqlc.GetCounterQuoteRow, items []any) map[string]any {
	return map[string]any{
		"id": row.ID, "number": row.Number, "branch_id": row.BranchID, "branch_name": row.BranchName,
		"workshop_name": row.WorkshopName, "workshop_nit": row.WorkshopNit, "verified_at": nullableTime(row.VerifiedAt),
		"customer_name": row.CustomerName, "customer_phone": row.CustomerPhone, "vehicle_id": row.VehicleID,
		"vehicle_make": row.VehicleMake, "vehicle_model": row.VehicleModel, "vehicle_year": row.VehicleYear, "vehicle_plate": row.VehiclePlate,
		"notes": row.Notes, "valid_until": nullableDate(row.ValidUntil), "items": items, "total": row.Total, "currency": row.Currency,
		"outcome": row.Outcome, "outcome_at": nullableTime(row.OutcomeAt), "outcome_by": row.OutcomeBy,
		"shared_at": nullableTime(row.SharedAt), "share_expires_at": nullableTime(row.ShareExpiresAt), "created_at": row.CreatedAt.Time,
		"converted_order_id": row.ConvertedOrderID, "converted_order_number": row.ConvertedOrderNumber,
	}
}

func (s *server) writeCounterQuote(w http.ResponseWriter, r *http.Request, wc workshopAccess, id uuid.UUID, status int) error {
	q := sqlc.New(s.db)
	row, err := q.GetCounterQuote(r.Context(), sqlc.GetCounterQuoteParams{ID: id, WorkshopID: wc.workshopID})
	if err != nil {
		return notFoundIfMissing(err, quoteNotFound)
	}
	items, err := q.ListQuoteItems(r.Context(), id)
	if err != nil {
		return err
	}
	writeJSON(w, status, counterQuoteJSON(row, quoteItemsJSON(items)))
	return nil
}

func (s *server) findCounterQuote(r *http.Request, wc workshopAccess) (sqlc.GetCounterQuoteRow, error) {
	id, err := pathID(r, "quoteID", quoteNotFound)
	if err != nil {
		return sqlc.GetCounterQuoteRow{}, err
	}
	row, err := sqlc.New(s.db).GetCounterQuote(r.Context(), sqlc.GetCounterQuoteParams{ID: id, WorkshopID: wc.workshopID})
	if err != nil {
		return row, notFoundIfMissing(err, quoteNotFound)
	}
	if !wc.canReadBranch(row.BranchID) {
		return row, notFound(quoteNotFound)
	}
	return row, nil
}

func (s *server) writableCounterQuote(r *http.Request, wc workshopAccess) (sqlc.GetCounterQuoteRow, error) {
	row, err := s.findCounterQuote(r, wc)
	if err != nil {
		return row, err
	}
	return row, wc.requireBranchWriter(row.BranchID)
}

func (s *server) createCounterQuote(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	if err := wc.requireWriter(); err != nil {
		return err
	}
	var in counterQuoteBody
	if err := decode(r, &in); err != nil {
		return err
	}
	d, err := parseCounterQuote(in)
	if err != nil {
		return err
	}
	ctx := r.Context()
	if err = s.requireBranch(ctx, wc, d.branch); err != nil {
		return err
	}
	var created uuid.UUID
	err = retryNumbered(func() error {
		return s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
			if err := requireLinkedVehicle(ctx, q, wc, d.vehicle); err != nil {
				return auditEvent{}, err
			}
			number, err := q.NextQuoteNumber(ctx, wc.workshopID)
			if err != nil {
				return auditEvent{}, err
			}
			row, err := q.CreateCounterQuote(ctx, sqlc.CreateCounterQuoteParams{WorkshopID: wc.workshopID, BranchID: d.branch, Number: number, CustomerName: &d.name, CustomerPhone: d.phone, VehicleID: d.vehicle, VehicleMake: d.makeName, VehicleModel: &d.model, VehicleYear: d.year, VehiclePlate: d.plate, Notes: d.notes, ValidUntil: d.until, Total: d.total, CreatedBy: wc.userID})
			if err != nil {
				return auditEvent{}, err
			}
			if err = replaceQuoteItems(ctx, q, row.ID, d.items); err != nil {
				return auditEvent{}, err
			}
			created = row.ID
			return wc.event("quote", row.ID, "quote.create"), nil
		})
	})
	if err != nil {
		return err
	}
	return s.writeCounterQuote(w, r, wc, created, http.StatusCreated)
}

func pageWindow(r *http.Request) (limit, offset int32, err error) {
	limit = 50
	if v := r.URL.Query().Get("limit"); v != "" {
		n, e := strconv.Atoi(v)
		if e != nil || n < 1 || n > 100 {
			return 0, 0, badRequest("Límite inválido")
		}
		limit = int32(n)
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		n, e := strconv.Atoi(v)
		if e != nil || n < 0 {
			return 0, 0, badRequest("Desplazamiento inválido")
		}
		offset = int32(n)
	}
	return limit, offset, nil
}

func searchPattern(raw string) *string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	pattern := "%" + strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(raw) + "%"
	return &pattern
}

func (s *server) listCounterQuotes(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	limit, offset, err := pageWindow(r)
	if err != nil {
		return err
	}
	var outcome *sqlc.QuoteOutcome
	if v := r.URL.Query().Get("outcome"); v != "" {
		x := sqlc.QuoteOutcome(v)
		if !x.Valid() {
			return errInvalidOutcome
		}
		outcome = &x
	}
	rows, err := sqlc.New(s.db).ListCounterQuotes(r.Context(), sqlc.ListCounterQuotesParams{WorkshopID: wc.workshopID, BranchIds: wc.branchIDs, Outcome: outcome, Search: searchPattern(r.URL.Query().Get("q")), RowLimit: limit, RowOffset: offset})
	if err != nil {
		return err
	}
	var total int64
	items := []any{}
	for _, v := range rows {
		total = v.TotalCount
		items = append(items, map[string]any{
			"id": v.ID, "number": v.Number, "customer_name": v.CustomerName, "customer_phone": v.CustomerPhone,
			"vehicle_make": v.VehicleMake, "vehicle_model": v.VehicleModel, "vehicle_year": v.VehicleYear, "vehicle_plate": v.VehiclePlate,
			"total": v.Total, "currency": v.Currency, "outcome": v.Outcome, "created_at": v.CreatedAt.Time, "valid_until": nullableDate(v.ValidUntil),
			"converted_order_id": v.ConvertedOrderID, "converted_order_number": v.ConvertedOrderNumber,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": total})
	return nil
}

func (s *server) getCounterQuote(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	row, err := s.findCounterQuote(r, wc)
	if err != nil {
		return err
	}
	return s.writeCounterQuote(w, r, wc, row.ID, http.StatusOK)
}

func (s *server) updateCounterQuote(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	row, err := s.writableCounterQuote(r, wc)
	if err != nil {
		return err
	}
	if row.Outcome != sqlc.QuoteOutcomePendiente || row.WorkOrderID != nil {
		return conflict(quoteHasOutcome)
	}
	var in counterQuoteBody
	if err = decode(r, &in); err != nil {
		return err
	}
	d, err := parseCounterQuote(in)
	if err != nil {
		return err
	}
	ctx := r.Context()
	if err = s.requireBranch(ctx, wc, d.branch); err != nil {
		return err
	}
	err = s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		if err := requireLinkedVehicle(ctx, q, wc, d.vehicle); err != nil {
			return auditEvent{}, err
		}
		id, err := q.UpdateCounterQuote(ctx, sqlc.UpdateCounterQuoteParams{BranchID: d.branch, CustomerName: &d.name, CustomerPhone: d.phone, VehicleID: d.vehicle, VehicleMake: d.makeName, VehicleModel: &d.model, VehicleYear: d.year, VehiclePlate: d.plate, Notes: d.notes, ValidUntil: d.until, Total: d.total, ID: row.ID, WorkshopID: wc.workshopID})
		if errors.Is(err, pgx.ErrNoRows) {
			return auditEvent{}, conflict(quoteHasOutcome)
		}
		if err != nil {
			return auditEvent{}, err
		}
		if err = replaceQuoteItems(ctx, q, id, d.items); err != nil {
			return auditEvent{}, err
		}
		return wc.event("quote", id, "quote.update"), nil
	})
	if err != nil {
		return err
	}
	return s.writeCounterQuote(w, r, wc, row.ID, http.StatusOK)
}

func (s *server) counterQuoteOutcome(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	row, err := s.writableCounterQuote(r, wc)
	if err != nil {
		return err
	}
	if row.WorkOrderID != nil {
		return conflict(quoteAlreadyConverted)
	}
	var in struct {
		Outcome sqlc.QuoteOutcome `json:"outcome"`
	}
	if err = decode(r, &in); err != nil {
		return err
	}
	if err = parseOutcome(in.Outcome); err != nil {
		return err
	}
	ctx := r.Context()
	err = s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		id, err := q.SetCounterQuoteOutcome(ctx, sqlc.SetCounterQuoteOutcomeParams{Outcome: in.Outcome, OutcomeBy: &wc.userID, ID: row.ID, WorkshopID: wc.workshopID})
		if errors.Is(err, pgx.ErrNoRows) {
			return auditEvent{}, conflict(quoteAlreadyConverted)
		}
		return wc.event("quote", id, "quote.outcome"), err
	})
	if err != nil {
		return err
	}
	return s.writeCounterQuote(w, r, wc, row.ID, http.StatusOK)
}

func (s *server) shareCounterQuote(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	row, err := s.writableCounterQuote(r, wc)
	if err != nil {
		return err
	}
	token, hash, err := auth.NewTokenPair()
	if err != nil {
		return err
	}
	ctx := r.Context()
	var shared sqlc.ShareCounterQuoteRow
	err = s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		var err error
		shared, err = q.ShareCounterQuote(ctx, sqlc.ShareCounterQuoteParams{ShareTokenHash: &hash, ID: row.ID, WorkshopID: wc.workshopID})
		if err != nil {
			return auditEvent{}, notFoundIfMissing(err, quoteNotFound)
		}
		return wc.event("quote", shared.ID, "quote.share"), nil
	})
	if err != nil {
		return err
	}
	vehicle := "sin placa"
	if row.VehiclePlate != nil && *row.VehiclePlate != "" {
		vehicle = *row.VehiclePlate
	} else if row.VehicleModel != nil && *row.VehicleModel != "" {
		vehicle = *row.VehicleModel
	}
	writeJSON(w, http.StatusOK, s.quoteShareResponse(row.WorkshopName, vehicle, shared.Total, token, shared.ShareExpiresAt.Time, row.CustomerPhone))
	return nil
}

func quoteVehicle(ctx context.Context, q *sqlc.Queries, wc workshopAccess, locked sqlc.LockCounterQuoteRow) (uuid.UUID, error) {
	if locked.VehicleID != nil {
		return *locked.VehicleID, requireLinkedVehicle(ctx, q, wc, locked.VehicleID)
	}
	makeName := "Sin marca"
	if v := values.OptionalText(locked.VehicleMake); v != nil {
		makeName = *v
	}
	model := strings.TrimSpace(deref(locked.VehicleModel))
	customer := strings.TrimSpace(deref(locked.CustomerName))
	v, err := createProvisionalVehicle(ctx, q, wc, sqlc.CreateVehicleParams{Plate: locked.VehiclePlate, Make: makeName, Model: model, Year: locked.VehicleYear, ContactName: &customer, ContactPhone: locked.CustomerPhone})
	return v.ID, err
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func (s *server) convertCounterQuote(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	row, err := s.writableCounterQuote(r, wc)
	if err != nil {
		return err
	}
	ctx := r.Context()
	var orderID uuid.UUID
	err = retryNumbered(func() error {
		return s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
			locked, err := q.LockCounterQuote(ctx, sqlc.LockCounterQuoteParams{ID: row.ID, WorkshopID: wc.workshopID})
			if err != nil {
				return auditEvent{}, notFoundIfMissing(err, quoteNotFound)
			}
			if locked.WorkOrderID != nil {
				return auditEvent{}, conflict(quoteAlreadyConverted)
			}
			if locked.Outcome == sqlc.QuoteOutcomeRechazo {
				return auditEvent{}, conflict("La cotización fue rechazada")
			}
			vehicleID, err := quoteVehicle(ctx, q, wc, locked)
			if err != nil {
				return auditEvent{}, err
			}
			order, err := insertOrder(ctx, q, wc, newOrder{branch: locked.BranchID, vehicle: vehicleID, reason: fmt.Sprintf("Cotización COT-%04d", locked.Number)})
			if err != nil {
				return auditEvent{}, err
			}
			if _, err = q.MarkQuoteConverted(ctx, sqlc.MarkQuoteConvertedParams{WorkOrderID: &order.ID, ConvertedOrderID: &order.ID, OutcomeBy: &wc.userID, ID: locked.ID, WorkshopID: wc.workshopID}); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					return auditEvent{}, conflict(quoteAlreadyConverted)
				}
				return auditEvent{}, err
			}
			orderID = order.ID
			return wc.event("quote", locked.ID, "quote.convert"), nil
		})
	})
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, map[string]any{"order_id": orderID})
	return nil
}
