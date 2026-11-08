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
	decimalpkg "github.com/shopspring/decimal"
	"kilora/api/internal/auth"
	"kilora/api/internal/database/sqlc"
)

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
	type item struct{ kind, description, quantity, price string }
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
		items = append(items, item{v.Kind, v.Description, stringValue(q), stringValue(p)})
	}
	ctx := r.Context()
	tx, e := s.db.Begin(ctx)
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	defer tx.Rollback(ctx)
	var status string
	e = tx.QueryRow(ctx, "SELECT status FROM work_order WHERE id=$1 AND workshop_id=$2 FOR UPDATE", o.ID, o.WorkshopID).Scan(&status)
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	var id uuid.UUID
	var outcome string
	e = tx.QueryRow(ctx, `INSERT INTO quote(work_order_id,workshop_id,total,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(work_order_id) DO UPDATE SET total=EXCLUDED.total WHERE quote.outcome='pendiente' RETURNING id,outcome`, o.ID, o.WorkshopID, total.StringFixed(2), dbUUID(wc.UserID)).Scan(&id, &outcome)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 409, "La cotización ya tiene resultado")
		return
	}
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	_, e = tx.Exec(ctx, "DELETE FROM quote_item WHERE quote_id=$1", id)
	if e == nil {
		for i, v := range items {
			_, e = tx.Exec(ctx, "INSERT INTO quote_item(quote_id,position,kind,description,quantity,unit_price) VALUES($1,$2,$3,$4,$5,$6)", id, i, v.kind, v.description, v.quantity, v.price)
			if e != nil {
				break
			}
		}
	}
	if e == nil {
		e = audit(ctx, sqlc.New(tx), wc, dbUUID(id), "quote", "quote.save")
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	s.getQuote(w, r)
}

func (s *server) quoteData(r *http.Request, id uuid.UUID) (map[string]any, error) {
	var total, currency, outcome string
	var outcomeAt, sharedAt, expiresAt *time.Time
	var outcomeBy *uuid.UUID
	e := s.db.QueryRow(r.Context(), `SELECT total::text,currency,outcome::text,outcome_at,outcome_by,shared_at,share_expires_at FROM quote WHERE id=$1`, id).Scan(&total, &currency, &outcome, &outcomeAt, &outcomeBy, &sharedAt, &expiresAt)
	if e != nil {
		return nil, e
	}
	rows, e := s.db.Query(r.Context(), `SELECT kind::text,description,quantity::text,unit_price::text FROM quote_item WHERE quote_id=$1 ORDER BY position`, id)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	items := []any{}
	for rows.Next() {
		var kind, description, quantity, price string
		if e = rows.Scan(&kind, &description, &quantity, &price); e != nil {
			return nil, e
		}
		items = append(items, map[string]any{"kind": kind, "description": description, "quantity": quantity, "unit_price": price})
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}
	return map[string]any{"items": items, "total": total, "currency": currency, "outcome": outcome, "outcome_at": outcomeAt, "outcome_by": outcomeBy, "shared_at": sharedAt, "share_expires_at": expiresAt}, nil
}
func (s *server) getQuote(w http.ResponseWriter, r *http.Request) {
	o, _, ok := s.findOrder(w, r)
	if !ok {
		return
	}
	var id uuid.UUID
	e := s.db.QueryRow(r.Context(), "SELECT id FROM quote WHERE work_order_id=$1 AND workshop_id=$2", o.ID, o.WorkshopID).Scan(&id)
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
	tx, e := s.db.Begin(ctx)
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	defer tx.Rollback(ctx)
	var id uuid.UUID
	var expires time.Time
	var name, total string
	var plate, phone *string
	e = tx.QueryRow(ctx, `UPDATE quote SET share_token_hash=$1,shared_at=now(),share_expires_at=now()+interval '15 days' WHERE work_order_id=$2 AND workshop_id=$3 RETURNING id,share_expires_at,total::text`, auth.HashToken(token), o.ID, o.WorkshopID).Scan(&id, &expires, &total)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404, "Cotización no encontrada")
		return
	}
	if e == nil {
		e = tx.QueryRow(ctx, `SELECT w.name,v.plate,v.contact_phone FROM work_order o JOIN workshop w ON w.id=o.workshop_id JOIN vehicle v ON v.id=o.vehicle_id WHERE o.id=$1`, o.ID).Scan(&name, &plate, &phone)
	}
	if e == nil {
		e = audit(ctx, sqlc.New(tx), wc, dbUUID(id), "quote", "quote.share")
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	link := strings.TrimRight(s.origin, "/") + "/c/" + token
	plateText := "sin placa"
	if plate != nil {
		plateText = *plate
	}
	number := ""
	if phone != nil {
		number = strings.TrimPrefix(*phone, "+")
	}
	text := fmt.Sprintf("Cotización de %s para %s: $%s. Consulta el detalle: %s", name, plateText, total, link)
	writeJSON(w, 200, map[string]any{"url": link, "expires_at": expires, "whatsapp_url": "https://wa.me/" + number + "?text=" + url.QueryEscape(text)})
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
	tx, e := s.db.Begin(ctx)
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	defer tx.Rollback(ctx)
	var id uuid.UUID
	e = tx.QueryRow(ctx, `UPDATE quote SET outcome=$1,outcome_at=now(),outcome_by=$2 WHERE work_order_id=$3 AND workshop_id=$4 RETURNING id`, in.Outcome, dbUUID(wc.UserID), o.ID, o.WorkshopID).Scan(&id)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404, "Cotización no encontrada")
		return
	}
	if e == nil {
		e = audit(ctx, sqlc.New(tx), wc, dbUUID(id), "quote", "quote.outcome")
	}
	if e == nil {
		e = tx.Commit(ctx)
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
	var id uuid.UUID
	var name, make, model string
	var verified, shared, expires *time.Time
	var plate *string
	var year *int32
	var number int32
	e := s.db.QueryRow(r.Context(), `SELECT q.id,w.name,w.verified_at,v.plate,v.make,v.model,v.year,o.number,q.shared_at,q.share_expires_at FROM quote q JOIN work_order o ON o.id=q.work_order_id JOIN workshop w ON w.id=q.workshop_id JOIN vehicle v ON v.id=o.vehicle_id WHERE q.share_token_hash=$1 AND q.share_expires_at>now()`, auth.HashToken(chi.URLParam(r, "token"))).Scan(&id, &name, &verified, &plate, &make, &model, &year, &number, &shared, &expires)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404, "Cotización no disponible")
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
	writeJSON(w, 200, map[string]any{"workshop_name": name, "verified_at": verified, "plate": plate, "make": make, "model": model, "year": year, "order_number": number, "items": v["items"], "total": v["total"], "currency": v["currency"], "shared_at": shared, "share_expires_at": expires})
}
