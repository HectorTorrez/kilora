package httpserver

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"kilora/api/internal/assistant"
	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/history"
	"kilora/api/internal/values"
)

const recordNotFound = "Registro no encontrado"

func vehicleLabel(brand, model string, year *int32) string {
	parts := []string{strings.TrimSpace(brand), strings.TrimSpace(model)}
	if year != nil {
		parts = append(parts, decimal.NewFromInt32(*year).String())
	}
	return strings.TrimSpace(strings.Join(strings.Fields(strings.Join(parts, " ")), " "))
}

// explainRecord resume un servicio del historial en lenguaje sencillo para el
// propietario. El modelo recibe la misma proyección que el propietario ve en
// la aplicación, sin IDs internos.
func (s *server) explainRecord(w http.ResponseWriter, r *http.Request) error {
	recordID, err := pathID(r, "recordID", recordNotFound)
	if err != nil {
		return err
	}
	ctx := r.Context()
	q := sqlc.New(s.db)
	user := currentUser(ctx).ID
	vehicle, err := ownedVehicle(ctx, q, r, user)
	if err != nil {
		return err
	}
	row, err := q.GetHistoryRecordForOwner(ctx, sqlc.GetHistoryRecordForOwnerParams{ID: recordID, VehicleID: vehicle.ID, OwnerUserID: &user})
	if err != nil {
		return notFoundIfMissing(err, recordNotFound)
	}
	projected, err := s.ownerProjection(ctx, q, row)
	if err != nil {
		return err
	}
	if err := s.aiAllowed(r); err != nil {
		return err
	}
	text, err := s.ai.ExplainService(ctx, vehicleLabel(vehicle.Make, vehicle.Model, vehicle.Year), projected)
	if err != nil {
		s.logger.Error("explicación de servicio", "error", err)
		return httpError{http.StatusBadGateway, "La IA no pudo explicar el servicio. Intenta de nuevo."}
	}
	writeJSON(w, http.StatusOK, map[string]string{"explanation": text})
	return nil
}

// ownerProjection devuelve el registro tal como lo ve el propietario, como
// JSON genérico y sin identificadores internos.
func (s *server) ownerProjection(ctx context.Context, q *sqlc.Queries, row sqlc.HistoryRecord) (map[string]any, error) {
	corrections, err := q.ListCorrectionsForRecords(ctx, []uuid.UUID{row.ID})
	if err != nil {
		return nil, err
	}
	var workshop *sqlc.Workshop
	if row.WorkshopID != nil {
		found, err := q.GetWorkshop(ctx, *row.WorkshopID)
		if err != nil {
			return nil, err
		}
		workshop = &found
	}
	rec, err := historyRecord(row, workshop, corrections)
	if err != nil {
		return nil, err
	}
	p, ok := history.Project(history.ViewerOwner, rec)
	if !ok {
		return nil, notFound(recordNotFound)
	}
	data, err := json.Marshal(p)
	if err != nil {
		return nil, err
	}
	var out map[string]any
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, err
	}
	for _, key := range []string{"id", "workshop_id", "created_by", "workshop_verified_at"} {
		delete(out, key)
	}
	if list, ok := out["corrections"].([]any); ok {
		for _, c := range list {
			if m, ok := c.(map[string]any); ok {
				delete(m, "id")
				delete(m, "created_by")
			}
		}
	}
	return out, nil
}

func quoteLines(rows []sqlc.ListQuoteItemsRow) []assistant.QuoteLine {
	lines := make([]assistant.QuoteLine, 0, len(rows))
	for _, v := range rows {
		quantity, _ := decimal.NewFromString(v.Quantity)
		price, _ := decimal.NewFromString(v.UnitPrice)
		kind := "repuesto"
		if v.Kind == sqlc.QuoteItemKindManoDeObra {
			kind = "mano de obra"
		}
		lines = append(lines, assistant.QuoteLine{Kind: kind, Description: v.Description, Brand: v.Brand, Quantity: quantity.String(), Subtotal: values.LineTotal(quantity, price).StringFixed(2)})
	}
	return lines
}

func (s *server) writeQuoteMessage(w http.ResponseWriter, r *http.Request, quoteID uuid.UUID, c assistant.QuoteContext) error {
	ctx := r.Context()
	q := sqlc.New(s.db)
	data, err := q.GetQuoteData(ctx, quoteID)
	if err != nil {
		return notFoundIfMissing(err, quoteNotFound)
	}
	rows, err := q.ListQuoteItems(ctx, quoteID)
	if err != nil {
		return err
	}
	c.Items, c.Total = quoteLines(rows), data.Total
	if err := s.aiAllowed(r); err != nil {
		return err
	}
	text, err := s.ai.QuoteMessage(ctx, c)
	if err != nil {
		s.logger.Error("mensaje de cotización", "error", err)
		return httpError{http.StatusBadGateway, "La IA no pudo redactar el mensaje. Intenta de nuevo."}
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": text})
	return nil
}

// orderQuoteMessage redacta el mensaje de WhatsApp de la cotización de una
// orden. No comparte nada: el recepcionista lo revisa y lo envía.
func (s *server) orderQuoteMessage(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	o, err := s.writableOrder(r, wc)
	if err != nil {
		return err
	}
	ctx := r.Context()
	q := sqlc.New(s.db)
	meta, err := q.GetOrderQuoteMeta(ctx, sqlc.GetOrderQuoteMetaParams{WorkOrderID: &o.ID, WorkshopID: o.WorkshopID})
	if err != nil {
		return notFoundIfMissing(err, quoteNotFound)
	}
	workshop, err := q.GetWorkshop(ctx, o.WorkshopID)
	if err != nil {
		return err
	}
	c := assistant.QuoteContext{Workshop: workshop.Name}
	if v, err := q.GetVehicle(ctx, sqlc.GetVehicleParams{ID: o.VehicleID, WorkshopID: wc.workshopID}); err == nil {
		c.Vehicle = vehicleLabel(v.Make, v.Model, v.Year)
	}
	return s.writeQuoteMessage(w, r, meta.ID, c)
}

// counterQuoteMessage redacta el mensaje de WhatsApp de una cotización de
// mostrador.
func (s *server) counterQuoteMessage(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	row, err := s.writableCounterQuote(r, wc)
	if err != nil {
		return err
	}
	c := assistant.QuoteContext{Workshop: row.WorkshopName}
	if row.CustomerName != nil {
		c.Customer = *row.CustomerName
	}
	model := ""
	if row.VehicleModel != nil {
		model = *row.VehicleModel
	}
	brand := ""
	if row.VehicleMake != nil {
		brand = *row.VehicleMake
	}
	c.Vehicle = vehicleLabel(brand, model, row.VehicleYear)
	if d := nullableDate(row.ValidUntil); d != nil {
		c.Valid = *d
	}
	return s.writeQuoteMessage(w, r, row.ID, c)
}
