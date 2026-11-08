package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"kilora/api/internal/database"
	"kilora/api/internal/database/sqlc"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
)

var decimalPattern = regexp.MustCompile(`^[0-9]+(?:\.[0-9]{1,2})?$`)

func decimal(raw json.RawMessage, fallback string) (pgtype.Numeric, bool) {
	var n pgtype.Numeric
	if len(raw) == 0 || string(raw) == "null" {
		if fallback == "" {
			return n, true
		}
		raw = []byte(fallback)
	}
	s := string(raw)
	if len(s) > 0 && s[0] == '"' {
		if json.Unmarshal(raw, &s) != nil {
			return n, false
		}
	}
	if !decimalPattern.MatchString(s) || len(strings.TrimLeft(strings.Split(s, ".")[0], "0")) > 10 {
		return n, false
	}
	if n.Scan(s) != nil {
		return n, false
	}
	return n, true
}
func stringValue(n pgtype.Numeric) string {
	v, _ := n.Value()
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func numeric(n pgtype.Numeric) any {
	if !n.Valid {
		return nil
	}
	v, e := n.Value()
	if e != nil {
		return nil
	}
	return v
}
func jobDTO(j sqlc.Job) map[string]any {
	return map[string]any{"id": uuid.UUID(j.ID.Bytes), "work_order_id": uuid.UUID(j.WorkOrderID.Bytes), "position": j.Position, "description": j.Description, "category": j.Category, "labor_price": numeric(j.LaborPrice), "internal_cost": numeric(j.InternalCost), "mechanic_notes": j.MechanicNotes, "currency": j.Currency}
}
func partDTO(p sqlc.Part) map[string]any {
	return map[string]any{"id": uuid.UUID(p.ID.Bytes), "job_id": uuid.UUID(p.JobID.Bytes), "name": p.Name, "brand": p.Brand, "model": p.Model, "quantity": numeric(p.Quantity), "unit_price": numeric(p.UnitPrice), "internal_cost": numeric(p.InternalCost), "currency": p.Currency}
}
func (s *server) mutableOrder(w http.ResponseWriter, r *http.Request) (sqlc.WorkOrder, WorkshopContext, bool) {
	o, wc, ok := s.findOrder(w, r)
	if !ok {
		return o, wc, false
	}
	if !writeAllowed(w, wc) || !branchWrite(w, wc, o) {
		return o, wc, false
	}
	if o.Status == sqlc.WorkOrderStatusListo || o.Status == sqlc.WorkOrderStatusCancelado {
		fail(w, 409, "La orden está cerrada")
		return o, wc, false
	}
	return o, wc, true
}
func (s *server) createJob(w http.ResponseWriter, r *http.Request) {
	o, wc, ok := s.mutableOrder(w, r)
	if !ok {
		return
	}
	var in struct {
		Description   string             `json:"description"`
		Category      *sqlc.PartCategory `json:"category"`
		LaborPrice    json.RawMessage    `json:"labor_price"`
		InternalCost  json.RawMessage    `json:"internal_cost"`
		MechanicNotes *string            `json:"mechanic_notes"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Description = strings.TrimSpace(in.Description)
	a, ok1 := decimal(in.LaborPrice, "")
	b, ok2 := decimal(in.InternalCost, "")
	if in.Description == "" || !ok1 || !ok2 {
		fail(w, 400, "Datos de trabajo inválidos")
		return
	}
	if in.Category != nil {
		switch *in.Category {
		case "aceite", "frenos", "amortiguadores", "bateria", "llantas", "otro":
		default:
			fail(w, 400, "Categoría inválida")
			return
		}
	}
	q := jobQueries(r.Context(), s)
	jobs, e := q.ListJobsByWorkOrder(r.Context(), sqlc.ListJobsByWorkOrderParams{WorkOrderID: o.ID, WorkshopID: o.WorkshopID})
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	var pos int32
	for _, j := range jobs {
		if j.Position >= pos {
			pos = j.Position + 1
		}
	}
	j, e := q.CreateJob(r.Context(), sqlc.CreateJobParams{WorkOrderID: o.ID, WorkshopID: dbUUID(wc.WorkshopID), Position: pos, Description: in.Description, Category: in.Category, LaborPrice: a, InternalCost: b, MechanicNotes: in.MechanicNotes, Currency: "USD"})
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	writeJSON(w, 201, jobDTO(j))
}
func (s *server) findJob(w http.ResponseWriter, r *http.Request, o sqlc.WorkOrder) (sqlc.Job, bool) {
	id, e := uuid.Parse(chi.URLParam(r, "jobID"))
	if e == nil {
		jobs, err := jobQueries(r.Context(), s).ListJobsByWorkOrder(r.Context(), sqlc.ListJobsByWorkOrderParams{WorkOrderID: o.ID, WorkshopID: o.WorkshopID})
		if err != nil {
			fail(w, 500, "Error interno")
			return sqlc.Job{}, false
		}
		for _, j := range jobs {
			if j.ID.Bytes == id {
				return j, true
			}
		}
	}
	fail(w, 404, "Trabajo no encontrado")
	return sqlc.Job{}, false
}
func (s *server) deleteJob(w http.ResponseWriter, r *http.Request) {
	o, wc, ok := s.mutableOrder(w, r)
	if !ok {
		return
	}
	j, ok := s.findJob(w, r, o)
	if !ok {
		return
	}
	_, e := jobQueries(r.Context(), s).DeleteJob(r.Context(), sqlc.DeleteJobParams{ID: j.ID, WorkshopID: dbUUID(wc.WorkshopID)})
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	w.WriteHeader(204)
}
func (s *server) createPart(w http.ResponseWriter, r *http.Request) {
	o, wc, ok := s.mutableOrder(w, r)
	if !ok {
		return
	}
	j, ok := s.findJob(w, r, o)
	if !ok {
		return
	}
	var in struct {
		Name         string          `json:"name"`
		Brand        *string         `json:"brand"`
		Model        *string         `json:"model"`
		Quantity     json.RawMessage `json:"quantity"`
		UnitPrice    json.RawMessage `json:"unit_price"`
		InternalCost json.RawMessage `json:"internal_cost"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	quantity, a := decimal(in.Quantity, "1")
	price, b := decimal(in.UnitPrice, "")
	cost, c := decimal(in.InternalCost, "")
	if in.Name == "" || !a || !b || !c || quantity.Int.Sign() <= 0 || len(strings.TrimLeft(strings.Split(stringValue(quantity), ".")[0], "0")) > 8 {
		fail(w, 400, "Datos de pieza inválidos")
		return
	}
	p, e := jobQueries(r.Context(), s).CreatePart(r.Context(), sqlc.CreatePartParams{JobID: j.ID, WorkshopID: dbUUID(wc.WorkshopID), Name: in.Name, Brand: in.Brand, Model: in.Model, Quantity: quantity, UnitPrice: price, InternalCost: cost, Currency: "USD"})
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	writeJSON(w, 201, partDTO(p))
}
func (s *server) deletePart(w http.ResponseWriter, r *http.Request) {
	o, wc, ok := s.mutableOrder(w, r)
	if !ok {
		return
	}
	j, ok := s.findJob(w, r, o)
	if !ok {
		return
	}
	id, e := uuid.Parse(chi.URLParam(r, "partID"))
	if e != nil {
		fail(w, 404, "Pieza no encontrada")
		return
	}
	q := jobQueries(r.Context(), s)
	parts, e := q.ListPartsByWorkOrder(r.Context(), sqlc.ListPartsByWorkOrderParams{WorkOrderID: o.ID, WorkshopID: o.WorkshopID})
	if e != nil {
		fail(w, 500, "Error interno")
		return
	}
	for _, p := range parts {
		if p.ID.Bytes == id && p.JobID == j.ID {
			_, e = q.DeletePart(r.Context(), sqlc.DeletePartParams{ID: p.ID, WorkshopID: dbUUID(wc.WorkshopID)})
			if e != nil {
				fail(w, 500, "Error interno")
				return
			}
			w.WriteHeader(204)
			return
		}
	}
	fail(w, 404, "Pieza no encontrada")
}

type jobTxKey struct{}

func jobQueries(ctx context.Context, s *server) *sqlc.Queries {
	if q, ok := ctx.Value(jobTxKey{}).(*sqlc.Queries); ok {
		return q
	}
	return sqlc.New(s.db)
}
func (s *server) jobTransaction(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		recorder := httptest.NewRecorder()
		err := database.WithTx(r.Context(), s.db, func(q *sqlc.Queries) error {
			next.ServeHTTP(recorder, r.WithContext(context.WithValue(r.Context(), jobTxKey{}, q)))
			if recorder.Code >= 400 {
				return errors.New("rollback")
			}
			return nil
		})
		if err != nil && recorder.Code < 400 {
			fail(w, 500, "Error interno")
			return
		}
		for k, values := range recorder.Header() {
			for _, v := range values {
				w.Header().Add(k, v)
			}
		}
		w.WriteHeader(recorder.Code)
		_, _ = w.Write(recorder.Body.Bytes())
	})
}
