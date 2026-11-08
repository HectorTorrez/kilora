package httpserver

import (
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"kilora/api/internal/auth"
	"kilora/api/internal/database"
	"kilora/api/internal/database/sqlc"
)

var errWorkshopVehicle = errors.New("vehículo del taller")

var elSalvador = time.FixedZone("America/El_Salvador", -6*60*60)

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
	vehicle                       pgtype.UUID
	branch                        uuid.UUID
	until                         pgtype.Date
	items                         []parsedQuoteItem
	total                         pgtype.Numeric
}

func quoteValidUntil(days int) pgtype.Date {
	now := time.Now().In(elSalvador)
	day := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, days)
	return pgtype.Date{Time: day, Valid: true}
}

func optionalText(v *string) *string {
	if v == nil {
		return nil
	}
	s := strings.TrimSpace(*v)
	if s == "" {
		return nil
	}
	return &s
}

func searchPattern(raw string) *string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(raw)
	pattern := "%" + escaped + "%"
	return &pattern
}

func pageWindow(r *http.Request) (int32, int32, string) {
	limit := int32(50)
	if v := r.URL.Query().Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 100 {
			return 0, 0, "Límite inválido"
		}
		limit = int32(n)
	}
	var offset int32
	if v := r.URL.Query().Get("offset"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 {
			return 0, 0, "Desplazamiento inválido"
		}
		offset = int32(n)
	}
	return limit, offset, ""
}

func normalizeCounterQuote(in counterQuoteBody) (counterDraft, string) {
	var draft counterDraft
	draft.name = strings.TrimSpace(in.CustomerName)
	draft.model = strings.TrimSpace(in.VehicleModel)
	if draft.name == "" {
		return draft, "Nombre del cliente obligatorio"
	}
	if draft.model == "" {
		return draft, "Modelo del vehículo obligatorio"
	}
	if in.CustomerPhone != nil && strings.TrimSpace(*in.CustomerPhone) != "" {
		phone, ok := normalizePhone(*in.CustomerPhone)
		if !ok {
			return draft, "Teléfono inválido"
		}
		draft.phone = &phone
	}
	draft.makeName = optionalText(in.VehicleMake)
	draft.plate = nil
	if in.VehiclePlate != nil {
		plate := normalizePlate(*in.VehiclePlate)
		if plate != "" {
			draft.plate = &plate
		}
	}
	draft.notes = optionalText(in.Notes)
	if in.VehicleYear != nil {
		if *in.VehicleYear < 1886 || *in.VehicleYear > 2100 {
			return draft, "Año inválido"
		}
		draft.year = in.VehicleYear
	}
	if in.BranchID == uuid.Nil {
		return draft, "Sucursal inválida"
	}
	draft.branch = in.BranchID
	if in.VehicleID != nil && *in.VehicleID != uuid.Nil {
		draft.vehicle = dbUUID(*in.VehicleID)
	}
	days := 15
	if in.ValidDays != nil {
		days = *in.ValidDays
		if days < 1 || days > 365 {
			return draft, "Vigencia inválida"
		}
	}
	draft.until = quoteValidUntil(days)
	items, total, err := parseQuoteItems(in.Items)
	if errors.Is(err, errQuoteItemsEmpty) {
		return draft, "Agrega al menos un ítem"
	}
	if err != nil {
		return draft, "Datos de cotización inválidos"
	}
	draft.items = items
	draft.total = dbMoney(total)
	return draft, ""
}

func counterWrite(w http.ResponseWriter, wc WorkshopContext, branch pgtype.UUID) bool {
	if !writeAllowed(w, wc) {
		return false
	}
	if !branchAllowed(wc, uuid.UUID(branch.Bytes)) {
		fail(w, 403, "Acceso denegado")
		return false
	}
	return true
}

func (s *server) ensureBranch(w http.ResponseWriter, r *http.Request, wc WorkshopContext, id uuid.UUID) bool {
	if !branchAllowed(wc, id) {
		fail(w, 403, "Acceso denegado")
		return false
	}
	_, err := sqlc.New(s.db).GetBranch(r.Context(), sqlc.GetBranchParams{ID: dbUUID(id), WorkshopID: dbUUID(wc.WorkshopID)})
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 404, "Sucursal no encontrada")
		return false
	}
	if err != nil {
		fail(w, 500, "Error interno")
		return false
	}
	return true
}

func quoteItemJSON(rows []sqlc.ListQuoteItemsRow) []any {
	items := []any{}
	for _, v := range rows {
		items = append(items, map[string]any{"kind": v.Kind, "description": v.Description, "quantity": v.Quantity, "unit_price": v.UnitPrice})
	}
	return items
}

func counterQuoteJSON(row sqlc.GetCounterQuoteRow, items []any) map[string]any {
	return map[string]any{
		"id": uuid.UUID(row.ID.Bytes), "number": row.Number, "branch_id": uuid.UUID(row.BranchID.Bytes), "branch_name": row.BranchName,
		"workshop_name": row.WorkshopName, "workshop_nit": row.WorkshopNit, "verified_at": nullableTime(row.VerifiedAt),
		"customer_name": row.CustomerName, "customer_phone": row.CustomerPhone, "vehicle_id": nullableUUID(row.VehicleID),
		"vehicle_make": row.VehicleMake, "vehicle_model": row.VehicleModel, "vehicle_year": row.VehicleYear, "vehicle_plate": row.VehiclePlate,
		"notes": row.Notes, "valid_until": dateValue(row.ValidUntil), "items": items, "total": row.Total, "currency": row.Currency,
		"outcome": row.Outcome, "outcome_at": nullableTime(row.OutcomeAt), "outcome_by": nullableUUID(row.OutcomeBy),
		"shared_at": nullableTime(row.SharedAt), "share_expires_at": nullableTime(row.ShareExpiresAt), "created_at": row.CreatedAt.Time,
		"converted_order_id": nullableUUID(row.ConvertedOrderID), "converted_order_number": row.ConvertedOrderNumber,
	}
}

func (s *server) writeCounterQuote(w http.ResponseWriter, r *http.Request, id pgtype.UUID, status int) {
	wc, _ := CurrentWorkshop(r.Context())
	q := sqlc.New(s.db)
	row, err := q.GetCounterQuote(r.Context(), sqlc.GetCounterQuoteParams{ID: id, WorkshopID: dbUUID(wc.WorkshopID)})
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 404, "Cotización no encontrada")
		return
	}
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	items, err := q.ListQuoteItems(r.Context(), id)
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	writeJSON(w, status, counterQuoteJSON(row, quoteItemJSON(items)))
}

func (s *server) findCounterQuote(w http.ResponseWriter, r *http.Request) (sqlc.GetCounterQuoteRow, WorkshopContext, bool) {
	wc, _ := CurrentWorkshop(r.Context())
	id, err := uuid.Parse(chi.URLParam(r, "quoteID"))
	if err != nil {
		fail(w, 404, "Cotización no encontrada")
		return sqlc.GetCounterQuoteRow{}, wc, false
	}
	row, err := sqlc.New(s.db).GetCounterQuote(r.Context(), sqlc.GetCounterQuoteParams{ID: dbUUID(id), WorkshopID: dbUUID(wc.WorkshopID)})
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 404, "Cotización no encontrada")
		return row, wc, false
	}
	if err != nil {
		fail(w, 500, "Error interno")
		return row, wc, false
	}
	return row, wc, true
}

func (s *server) createCounterQuote(w http.ResponseWriter, r *http.Request) {
	wc, _ := CurrentWorkshop(r.Context())
	if !writeAllowed(w, wc) {
		return
	}
	var in counterQuoteBody
	if !decode(w, r, &in) {
		return
	}
	draft, msg := normalizeCounterQuote(in)
	if msg != "" {
		fail(w, 400, msg)
		return
	}
	if !s.ensureBranch(w, r, wc, draft.branch) {
		return
	}
	ctx := r.Context()
	var created pgtype.UUID
	var err error
	for attempt := 0; attempt < 3; attempt++ {
		err = database.WithTx(ctx, s.db, func(q *sqlc.Queries) error {
			if draft.vehicle.Valid {
				if _, e := q.GetVehicle(ctx, sqlc.GetVehicleParams{ID: draft.vehicle, WorkshopID: dbUUID(wc.WorkshopID)}); e != nil {
					if errors.Is(e, pgx.ErrNoRows) {
						return errWorkshopVehicle
					}
					return e
				}
			}
			number, e := q.NextQuoteNumber(ctx, dbUUID(wc.WorkshopID))
			if e != nil {
				return e
			}
			name, model := draft.name, draft.model
			row, e := q.CreateCounterQuote(ctx, sqlc.CreateCounterQuoteParams{
				WorkshopID: dbUUID(wc.WorkshopID), BranchID: dbUUID(draft.branch), Number: number, CustomerName: &name, CustomerPhone: draft.phone, VehicleID: draft.vehicle,
				VehicleMake: draft.makeName, VehicleModel: &model, VehicleYear: draft.year, VehiclePlate: draft.plate, Notes: draft.notes, ValidUntil: draft.until, Total: draft.total, CreatedBy: dbUUID(wc.UserID),
			})
			if e != nil {
				return e
			}
			if e = replaceQuoteItems(ctx, q, row.ID, draft.items); e != nil {
				return e
			}
			created = row.ID
			return audit(ctx, q, wc, row.ID, "quote", "quote.create")
		})
		var pe *pgconn.PgError
		if !errors.As(err, &pe) || pe.Code != "23505" {
			break
		}
	}
	if errors.Is(err, errWorkshopVehicle) {
		fail(w, 404, "Vehículo no encontrado")
		return
	}
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	s.writeCounterQuote(w, r, created, http.StatusCreated)
}

func (s *server) listCounterQuotes(w http.ResponseWriter, r *http.Request) {
	wc, _ := CurrentWorkshop(r.Context())
	limit, offset, msg := pageWindow(r)
	if msg != "" {
		fail(w, 400, msg)
		return
	}
	var outcome *sqlc.QuoteOutcome
	if v := r.URL.Query().Get("outcome"); v != "" {
		switch v {
		case "pendiente", "acepto", "rechazo", "no_respondio":
			x := sqlc.QuoteOutcome(v)
			outcome = &x
		default:
			fail(w, 400, "Resultado inválido")
			return
		}
	}
	rows, err := sqlc.New(s.db).ListCounterQuotes(r.Context(), sqlc.ListCounterQuotesParams{
		WorkshopID: dbUUID(wc.WorkshopID), Outcome: outcome, Search: searchPattern(r.URL.Query().Get("q")), RowLimit: limit, RowOffset: offset,
	})
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	var total int64
	items := []any{}
	for _, v := range rows {
		total = v.TotalCount
		items = append(items, map[string]any{
			"id": uuid.UUID(v.ID.Bytes), "number": v.Number, "customer_name": v.CustomerName, "customer_phone": v.CustomerPhone,
			"vehicle_make": v.VehicleMake, "vehicle_model": v.VehicleModel, "vehicle_year": v.VehicleYear, "vehicle_plate": v.VehiclePlate,
			"total": v.Total, "currency": v.Currency, "outcome": v.Outcome, "created_at": v.CreatedAt.Time, "valid_until": dateValue(v.ValidUntil),
			"converted_order_id": nullableUUID(v.ConvertedOrderID), "converted_order_number": v.ConvertedOrderNumber,
		})
	}
	writeJSON(w, 200, map[string]any{"items": items, "total": total})
}

func (s *server) getCounterQuote(w http.ResponseWriter, r *http.Request) {
	row, _, ok := s.findCounterQuote(w, r)
	if !ok {
		return
	}
	s.writeCounterQuote(w, r, row.ID, http.StatusOK)
}

func (s *server) updateCounterQuote(w http.ResponseWriter, r *http.Request) {
	row, wc, ok := s.findCounterQuote(w, r)
	if !ok {
		return
	}
	if !counterWrite(w, wc, row.BranchID) {
		return
	}
	if row.Outcome != "pendiente" || row.ConvertedOrderID.Valid || row.WorkOrderID.Valid {
		fail(w, 409, "La cotización ya tiene resultado")
		return
	}
	var in counterQuoteBody
	if !decode(w, r, &in) {
		return
	}
	draft, msg := normalizeCounterQuote(in)
	if msg != "" {
		fail(w, 400, msg)
		return
	}
	if !s.ensureBranch(w, r, wc, draft.branch) {
		return
	}
	ctx := r.Context()
	err := database.WithTx(ctx, s.db, func(q *sqlc.Queries) error {
		if draft.vehicle.Valid {
			if _, e := q.GetVehicle(ctx, sqlc.GetVehicleParams{ID: draft.vehicle, WorkshopID: dbUUID(wc.WorkshopID)}); e != nil {
				if errors.Is(e, pgx.ErrNoRows) {
					return errWorkshopVehicle
				}
				return e
			}
		}
		name, model := draft.name, draft.model
		id, e := q.UpdateCounterQuote(ctx, sqlc.UpdateCounterQuoteParams{
			BranchID: dbUUID(draft.branch), CustomerName: &name, CustomerPhone: draft.phone, VehicleID: draft.vehicle,
			VehicleMake: draft.makeName, VehicleModel: &model, VehicleYear: draft.year, VehiclePlate: draft.plate, Notes: draft.notes,
			ValidUntil: draft.until, Total: draft.total, ID: row.ID, WorkshopID: dbUUID(wc.WorkshopID),
		})
		if errors.Is(e, pgx.ErrNoRows) {
			return errQuoteFinalized
		}
		if e != nil {
			return e
		}
		if e = replaceQuoteItems(ctx, q, id, draft.items); e != nil {
			return e
		}
		return audit(ctx, q, wc, id, "quote", "quote.update")
	})
	if errors.Is(err, errWorkshopVehicle) {
		fail(w, 404, "Vehículo no encontrado")
		return
	}
	if errors.Is(err, errQuoteFinalized) {
		fail(w, 409, "La cotización ya tiene resultado")
		return
	}
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	s.writeCounterQuote(w, r, row.ID, http.StatusOK)
}

func (s *server) counterQuoteOutcome(w http.ResponseWriter, r *http.Request) {
	row, wc, ok := s.findCounterQuote(w, r)
	if !ok {
		return
	}
	if !counterWrite(w, wc, row.BranchID) {
		return
	}
	if row.ConvertedOrderID.Valid || row.WorkOrderID.Valid {
		fail(w, 409, "La cotización ya fue convertida en orden")
		return
	}
	var in struct {
		Outcome string `json:"outcome"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Outcome != "acepto" && in.Outcome != "rechazo" && in.Outcome != "no_respondio" {
		fail(w, 400, "Resultado inválido")
		return
	}
	ctx := r.Context()
	err := database.WithTx(ctx, s.db, func(q *sqlc.Queries) error {
		id, e := q.SetCounterQuoteOutcome(ctx, sqlc.SetCounterQuoteOutcomeParams{Outcome: sqlc.QuoteOutcome(in.Outcome), OutcomeBy: dbUUID(wc.UserID), ID: row.ID, WorkshopID: dbUUID(wc.WorkshopID)})
		if errors.Is(e, pgx.ErrNoRows) {
			return errQuoteConverted
		}
		if e != nil {
			return e
		}
		return audit(ctx, q, wc, id, "quote", "quote.outcome")
	})
	if errors.Is(err, errQuoteConverted) {
		fail(w, 409, "La cotización ya fue convertida en orden")
		return
	}
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	s.writeCounterQuote(w, r, row.ID, http.StatusOK)
}

func (s *server) shareCounterQuote(w http.ResponseWriter, r *http.Request) {
	row, wc, ok := s.findCounterQuote(w, r)
	if !ok {
		return
	}
	if !counterWrite(w, wc, row.BranchID) {
		return
	}
	token, err := auth.NewToken()
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	ctx := r.Context()
	hash := auth.HashToken(token)
	var shared sqlc.ShareCounterQuoteRow
	err = database.WithTx(ctx, s.db, func(q *sqlc.Queries) error {
		var e error
		shared, e = q.ShareCounterQuote(ctx, sqlc.ShareCounterQuoteParams{ShareTokenHash: &hash, ID: row.ID, WorkshopID: dbUUID(wc.WorkshopID)})
		if errors.Is(e, pgx.ErrNoRows) {
			return errQuoteNotFound
		}
		if e != nil {
			return e
		}
		return audit(ctx, q, wc, shared.ID, "quote", "quote.share")
	})
	if errors.Is(err, errQuoteNotFound) {
		fail(w, 404, "Cotización no encontrada")
		return
	}
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	link := strings.TrimRight(s.origin, "/") + "/c/" + token
	plateText := "sin placa"
	if row.VehiclePlate != nil && *row.VehiclePlate != "" {
		plateText = *row.VehiclePlate
	} else if row.VehicleModel != nil && *row.VehicleModel != "" {
		plateText = *row.VehicleModel
	}
	number := ""
	if row.CustomerPhone != nil {
		number = strings.TrimPrefix(*row.CustomerPhone, "+")
	}
	text := fmt.Sprintf("Cotización de %s para %s: $%s. Consulta el detalle: %s", row.WorkshopName, plateText, shared.Total, link)
	writeJSON(w, 200, map[string]any{"url": link, "expires_at": shared.ShareExpiresAt.Time, "whatsapp_url": "https://wa.me/" + number + "?text=" + url.QueryEscape(text)})
}

func (s *server) convertCounterQuote(w http.ResponseWriter, r *http.Request) {
	row, wc, ok := s.findCounterQuote(w, r)
	if !ok {
		return
	}
	if !counterWrite(w, wc, row.BranchID) {
		return
	}
	if row.ConvertedOrderID.Valid || row.WorkOrderID.Valid {
		fail(w, 409, "La cotización ya fue convertida en orden")
		return
	}
	if row.Outcome == "rechazo" {
		fail(w, 409, "La cotización fue rechazada")
		return
	}
	ctx := r.Context()
	var orderID pgtype.UUID
	var err error
	for attempt := 0; attempt < 3; attempt++ {
		err = database.WithTx(ctx, s.db, func(q *sqlc.Queries) error {
			locked, e := q.LockCounterQuote(ctx, sqlc.LockCounterQuoteParams{ID: row.ID, WorkshopID: dbUUID(wc.WorkshopID)})
			if errors.Is(e, pgx.ErrNoRows) {
				return errQuoteNotFound
			}
			if e != nil {
				return e
			}
			if locked.ConvertedOrderID.Valid || locked.WorkOrderID.Valid {
				return errQuoteConverted
			}
			if locked.Outcome == "rechazo" {
				return errQuoteRejected
			}
			vehicleID := locked.VehicleID
			if !vehicleID.Valid {
				makeName := "Sin marca"
				if locked.VehicleMake != nil && strings.TrimSpace(*locked.VehicleMake) != "" {
					makeName = strings.TrimSpace(*locked.VehicleMake)
				}
				model := ""
				if locked.VehicleModel != nil {
					model = strings.TrimSpace(*locked.VehicleModel)
				}
				customer := ""
				if locked.CustomerName != nil {
					customer = strings.TrimSpace(*locked.CustomerName)
				}
				if model == "" || customer == "" {
					return errQuoteItemsInvalid
				}
				vehicle, e := q.CreateVehicle(ctx, sqlc.CreateVehicleParams{
					CreatedByWorkshopID: dbUUID(wc.WorkshopID), Status: sqlc.VehicleStatusProvisional, Plate: locked.VehiclePlate,
					Make: makeName, Model: model, Year: locked.VehicleYear, ContactName: &customer, ContactPhone: locked.CustomerPhone,
				})
				if e != nil {
					return e
				}
				if e = q.LinkVehicleToWorkshop(ctx, sqlc.LinkVehicleToWorkshopParams{VehicleID: vehicle.ID, WorkshopID: dbUUID(wc.WorkshopID)}); e != nil {
					return e
				}
				if e = audit(ctx, q, wc, vehicle.ID, "vehicle", "vehicle.create"); e != nil {
					return e
				}
				vehicleID = vehicle.ID
			} else if _, e = q.GetVehicle(ctx, sqlc.GetVehicleParams{ID: vehicleID, WorkshopID: dbUUID(wc.WorkshopID)}); e != nil {
				if errors.Is(e, pgx.ErrNoRows) {
					return errWorkshopVehicle
				}
				return e
			}
			number, e := q.NextWorkOrderNumber(ctx, dbUUID(wc.WorkshopID))
			if e != nil {
				return e
			}
			order, e := q.CreateWorkOrder(ctx, sqlc.CreateWorkOrderParams{
				WorkshopID: dbUUID(wc.WorkshopID), BranchID: locked.BranchID, VehicleID: vehicleID, Number: number,
				Reason: fmt.Sprintf("Cotización COT-%04d", locked.Number), CreatedBy: dbUUID(wc.UserID),
			})
			if errors.Is(e, pgx.ErrNoRows) {
				return errWorkshopVehicle
			}
			if e != nil {
				return e
			}
			if _, e = q.TouchVehicleActivity(ctx, sqlc.TouchVehicleActivityParams{VehicleID: order.VehicleID, WorkshopID: order.WorkshopID}); e != nil {
				return e
			}
			if _, e = q.MarkQuoteConverted(ctx, sqlc.MarkQuoteConvertedParams{WorkOrderID: order.ID, ConvertedOrderID: order.ID, OutcomeBy: dbUUID(wc.UserID), ID: locked.ID, WorkshopID: dbUUID(wc.WorkshopID)}); e != nil {
				if errors.Is(e, pgx.ErrNoRows) {
					return errQuoteConverted
				}
				return e
			}
			if e = audit(ctx, q, wc, order.ID, "work_order", "work_order.create"); e != nil {
				return e
			}
			orderID = order.ID
			return audit(ctx, q, wc, locked.ID, "quote", "quote.convert")
		})
		var pe *pgconn.PgError
		if !errors.As(err, &pe) || pe.Code != "23505" {
			break
		}
	}
	if errors.Is(err, errQuoteNotFound) {
		fail(w, 404, "Cotización no encontrada")
		return
	}
	if errors.Is(err, errQuoteConverted) {
		fail(w, 409, "La cotización ya fue convertida en orden")
		return
	}
	if errors.Is(err, errQuoteRejected) {
		fail(w, 409, "La cotización fue rechazada")
		return
	}
	if errors.Is(err, errWorkshopVehicle) {
		fail(w, 404, "Vehículo no encontrado")
		return
	}
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	writeJSON(w, 200, map[string]any{"order_id": uuid.UUID(orderID.Bytes)})
}
