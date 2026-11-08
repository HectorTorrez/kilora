package httpserver

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	decimalpkg "github.com/shopspring/decimal"
	"kilora/api/internal/auth"
	"kilora/api/internal/database"
	"kilora/api/internal/database/sqlc"
)

var errQuoteFinalized = errors.New("cotización finalizada")
var errQuoteNotFound = errors.New("cotización no encontrada")

type quoteInputItem struct {
	Kind        string          `json:"kind"`
	Description string          `json:"description"`
	Quantity    json.RawMessage `json:"quantity"`
	UnitPrice   json.RawMessage `json:"unit_price"`
}

func (s *server) saveQuote(w http.ResponseWriter, r *http.Request) {
	o, wc, ok := s.findOrder(w, r)
	if !ok {
		return
	}
	if !writeAllowed(w, wc) || !branchWrite(w, wc, o) {
		return
	}
	var in struct {
		Items []quoteInputItem `json:"items"`
	}
	if !decode(w, r, &in) {
		return
	}
	if len(in.Items) == 0 {
		fail(w, 400, "Agrega al menos un ítem")
		return
	}
	type item struct {
		kind, description string
		quantity, price   pgtype.Numeric
	}
	var items []item
	total := decimalpkg.Zero
	for _, v := range in.Items {
		q, a := decimal(v.Quantity, "")
		p, b := decimal(v.UnitPrice, "")
		v.Description = strings.TrimSpace(v.Description)
		if !a || !b || !q.Valid || !p.Valid || q.Int.Sign() <= 0 || len(strings.Split(stringValue(q), ".")[0]) > 8 || v.Description == "" || (v.Kind != "repuesto" && v.Kind != "mano_de_obra") {
			fail(w, 400, "Datos de cotización inválidos")
			return
		}
		total = total.Add(money(q).Mul(money(p)).Round(2))
		items = append(items, item{v.Kind, v.Description, q, p})
	}
	ctx := r.Context()
	e := database.WithTx(ctx, s.db, func(q *sqlc.Queries) error {
		if _, err := q.LockWorkOrder(ctx, sqlc.LockWorkOrderParams{ID: o.ID, WorkshopID: o.WorkshopID}); err != nil {
			return err
		}
		quote, err := q.UpsertQuote(ctx, sqlc.UpsertQuoteParams{WorkOrderID: o.ID, WorkshopID: o.WorkshopID, Total: dbMoney(total), CreatedBy: dbUUID(wc.UserID)})
		if errors.Is(err, pgx.ErrNoRows) {
			return errQuoteFinalized
		}
		if err != nil {
			return err
		}
		if err = q.DeleteQuoteItems(ctx, quote.ID); err != nil {
			return err
		}
		for i, v := range items {
			if err = q.CreateQuoteItem(ctx, sqlc.CreateQuoteItemParams{QuoteID: quote.ID, Position: int32(i), Kind: sqlc.QuoteItemKind(v.kind), Description: v.description, Quantity: v.quantity, UnitPrice: v.price}); err != nil {
				return err
			}
		}
		return audit(ctx, q, wc, quote.ID, "quote", "quote.save")
	})
	if errors.Is(e, errQuoteFinalized) {
		fail(w, 409, "La cotización ya tiene resultado")
		return
	}
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	s.getQuote(w, r)
}

func nullableTime(v pgtype.Timestamptz) *time.Time {
	if !v.Valid {
		return nil
	}
	return &v.Time
}
func nullableUUID(v pgtype.UUID) *uuid.UUID {
	if !v.Valid {
		return nil
	}
	id := uuid.UUID(v.Bytes)
	return &id
}
func (s *server) quoteData(r *http.Request, id pgtype.UUID) (map[string]any, error) {
	q := sqlc.New(s.db)
	data, err := q.GetQuoteData(r.Context(), id)
	if err != nil {
		return nil, err
	}
	rows, err := q.ListQuoteItems(r.Context(), id)
	if err != nil {
		return nil, err
	}
	items := []any{}
	for _, v := range rows {
		items = append(items, map[string]any{"kind": v.Kind, "description": v.Description, "quantity": v.Quantity, "unit_price": v.UnitPrice})
	}
	return map[string]any{"items": items, "total": data.Total, "currency": data.Currency, "outcome": data.Outcome, "outcome_at": nullableTime(data.OutcomeAt), "outcome_by": nullableUUID(data.OutcomeBy), "shared_at": nullableTime(data.SharedAt), "share_expires_at": nullableTime(data.ShareExpiresAt)}, nil
}
func (s *server) getQuote(w http.ResponseWriter, r *http.Request) {
	o, _, ok := s.findOrder(w, r)
	if !ok {
		return
	}
	id, e := sqlc.New(s.db).GetQuoteIDByOrder(r.Context(), sqlc.GetQuoteIDByOrderParams{WorkOrderID: o.ID, WorkshopID: o.WorkshopID})
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404, "Cotización no encontrada")
		return
	}
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	v, e := s.quoteData(r, id)
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	writeJSON(w, 200, v)
}
func (s *server) shareQuote(w http.ResponseWriter, r *http.Request) {
	o, wc, ok := s.findOrder(w, r)
	if !ok {
		return
	}
	if !writeAllowed(w, wc) || !branchWrite(w, wc, o) {
		return
	}
	token, e := auth.NewToken()
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	ctx := r.Context()
	var shared sqlc.ShareQuoteRow
	var contact sqlc.GetQuoteContactRow
	hash := auth.HashToken(token)
	e = database.WithTx(ctx, s.db, func(q *sqlc.Queries) error {
		var err error
		shared, err = q.ShareQuote(ctx, sqlc.ShareQuoteParams{ShareTokenHash: &hash, WorkOrderID: o.ID, WorkshopID: o.WorkshopID})
		if errors.Is(err, pgx.ErrNoRows) {
			return errQuoteNotFound
		}
		if err != nil {
			return err
		}
		contact, err = q.GetQuoteContact(ctx, o.ID)
		if err != nil {
			return err
		}
		return audit(ctx, q, wc, shared.ID, "quote", "quote.share")
	})
	if errors.Is(e, errQuoteNotFound) {
		fail(w, 404, "Cotización no encontrada")
		return
	}
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	link := strings.TrimRight(s.origin, "/") + "/c/" + token
	plateText := "sin placa"
	if contact.Plate != nil {
		plateText = *contact.Plate
	}
	number := ""
	if contact.ContactPhone != nil {
		number = strings.TrimPrefix(*contact.ContactPhone, "+")
	}
	text := fmt.Sprintf("Cotización de %s para %s: $%s. Consulta el detalle: %s", contact.Name, plateText, shared.Total, link)
	writeJSON(w, 200, map[string]any{"url": link, "expires_at": shared.ShareExpiresAt.Time, "whatsapp_url": "https://wa.me/" + number + "?text=" + url.QueryEscape(text)})
}
func (s *server) quoteOutcome(w http.ResponseWriter, r *http.Request) {
	o, wc, ok := s.findOrder(w, r)
	if !ok {
		return
	}
	if !writeAllowed(w, wc) || !branchWrite(w, wc, o) {
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
	e := database.WithTx(ctx, s.db, func(q *sqlc.Queries) error {
		id, err := q.SetQuoteOutcome(ctx, sqlc.SetQuoteOutcomeParams{Outcome: sqlc.QuoteOutcome(in.Outcome), OutcomeBy: dbUUID(wc.UserID), WorkOrderID: o.ID, WorkshopID: o.WorkshopID})
		if errors.Is(err, pgx.ErrNoRows) {
			return errQuoteNotFound
		}
		if err != nil {
			return err
		}
		return audit(ctx, q, wc, id, "quote", "quote.outcome")
	})
	if errors.Is(e, errQuoteNotFound) {
		fail(w, 404, "Cotización no encontrada")
		return
	}
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	s.getQuote(w, r)
}
func (s *server) publicQuote(w http.ResponseWriter, r *http.Request) {
	if !s.limiter.allowLimit("quote:"+clientIP(r), 60) {
		fail(w, 429, "Demasiadas solicitudes")
		return
	}
	hash := auth.HashToken(chi.URLParam(r, "token"))
	public, e := sqlc.New(s.db).GetPublicQuote(r.Context(), &hash)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404, "Cotización no disponible")
		return
	}
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	v, e := s.quoteData(r, public.ID)
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	writeJSON(w, 200, map[string]any{"workshop_name": public.Name, "verified_at": nullableTime(public.VerifiedAt), "plate": public.Plate, "make": public.Make, "model": public.Model, "year": public.Year, "order_number": public.Number, "items": v["items"], "total": v["total"], "currency": v["currency"], "shared_at": nullableTime(public.SharedAt), "share_expires_at": nullableTime(public.ShareExpiresAt)})
}
