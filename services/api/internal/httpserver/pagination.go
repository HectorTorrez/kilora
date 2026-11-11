package httpserver

import (
	"net/http"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"kilora/api/internal/database/sqlc"
)

func (s *server) listOrdersPage(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	limit, offset, err := pageWindow(r)
	if err != nil {
		return err
	}
	statuses, ok := queryValues(r, "status", func(v string) bool { return sqlc.WorkOrderStatus(v).Valid() })
	if !ok {
		return badRequest("Estado inválido")
	}
	var branch *uuid.UUID
	if value := r.URL.Query().Get("branch_id"); value != "" {
		parsed, err := uuid.Parse(value)
		if err != nil {
			return badRequest("Sucursal inválida")
		}
		branch = &parsed
	}
	from, to, err := dateRange(r)
	if err != nil {
		return err
	}
	search := searchPattern(r.URL.Query().Get("q"))
	q := sqlc.New(s.db)
	counts, err := q.CountWorkOrdersByStatus(r.Context(), sqlc.CountWorkOrdersByStatusParams{WorkshopID: wc.workshopID, BranchIds: wc.branchIDs, BranchID: branch, Search: search, DateFrom: from, DateTo: to})
	if err != nil {
		return err
	}
	totals := map[string]int64{"": 0}
	for _, count := range counts {
		totals[string(count.Status)] = count.Total
		totals[""] += count.Total
	}
	rows, err := q.ListWorkOrdersPage(r.Context(), sqlc.ListWorkOrdersPageParams{WorkshopID: wc.workshopID, BranchIds: wc.branchIDs, BranchID: branch, Search: search, Statuses: statuses, DateFrom: from, DateTo: to, RowLimit: limit, RowOffset: offset})
	if err != nil {
		return err
	}
	items := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		v := row.WorkOrder
		items = append(items, map[string]any{"id": v.ID, "branch_id": v.BranchID, "vehicle_id": v.VehicleID, "number": v.Number, "status": v.Status, "reason": v.Reason, "plate": row.Plate, "make": row.Make, "model": row.Model, "received_at": v.ReceivedAt.Time})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": selectedTotal(totals, statuses), "counts": totals})
	return nil
}

func (s *server) listVehiclesPage(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	limit, offset, err := pageWindow(r)
	if err != nil {
		return err
	}
	statuses, ok := queryValues(r, "status", func(v string) bool {
		return v == string(sqlc.VehicleStatusProvisional) || v == string(sqlc.VehicleStatusVinculado)
	})
	if !ok {
		return badRequest("Estado inválido")
	}
	normalized := strings.Map(func(r rune) rune {
		if r == '-' || unicode.IsSpace(r) {
			return -1
		}
		return r
	}, strings.TrimSpace(r.URL.Query().Get("q")))
	from, to, err := dateRange(r)
	if err != nil {
		return err
	}
	search := searchPattern(normalized)
	q := sqlc.New(s.db)
	counts, err := q.CountVehiclesByStatus(r.Context(), sqlc.CountVehiclesByStatusParams{WorkshopID: wc.workshopID, Search: search, DateFrom: from, DateTo: to})
	if err != nil {
		return err
	}
	totals := map[string]int64{"": 0}
	for _, count := range counts {
		totals[string(count.Status)] = count.Total
		totals[""] += count.Total
	}
	rows, err := q.ListVehiclesPage(r.Context(), sqlc.ListVehiclesPageParams{WorkshopID: wc.workshopID, Search: search, Statuses: statuses, DateFrom: from, DateTo: to, RowLimit: limit, RowOffset: offset})
	if err != nil {
		return err
	}
	ids := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.Vehicle.ID)
	}
	readings, err := q.ListLatestOdometerForVehicles(r.Context(), sqlc.ListLatestOdometerForVehiclesParams{WorkshopID: wc.workshopID, VehicleIds: ids})
	if err != nil {
		return err
	}
	latest := make(map[uuid.UUID]*int32, len(readings))
	for i := range readings {
		latest[readings[i].VehicleID] = &readings[i].Km
	}
	items := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		items = append(items, vehicleDTO(row.Vehicle, latest[row.Vehicle.ID], refFromColumns(row.CustomerID, row.CustomerName, row.CustomerPhone)))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": selectedTotal(totals, statuses), "counts": totals})
	return nil
}

func (s *server) listAuditPage(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	if err := wc.requireAdmin(); err != nil {
		return err
	}
	limit, offset, err := pageWindow(r)
	if err != nil {
		return err
	}
	q := sqlc.New(s.db)
	total, err := q.CountAuditEvents(r.Context(), &wc.workshopID)
	if err != nil {
		return err
	}
	rows, err := q.ListAuditEventsPage(r.Context(), sqlc.ListAuditEventsPageParams{WorkshopID: &wc.workshopID, RowLimit: limit, RowOffset: offset})
	if err != nil {
		return err
	}
	items := make([]map[string]any, 0, len(rows))
	for _, a := range rows {
		items = append(items, map[string]any{"id": a.ID, "entity": a.Entity, "entity_id": a.EntityID, "action": a.Action, "actor_name": a.ActorName, "created_at": a.CreatedAt.Time})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": total})
	return nil
}

// queryValues lee un filtro que admite varios valores: ?status=a&status=b o
// ?status=a,b. Devuelve los valores sin repetir; vacío significa "todos".
func queryValues(r *http.Request, key string, valid func(string) bool) ([]string, bool) {
	out := []string{}
	seen := map[string]bool{}
	for _, raw := range r.URL.Query()[key] {
		for _, v := range strings.Split(raw, ",") {
			v = strings.TrimSpace(v)
			if v == "" || seen[v] {
				continue
			}
			if !valid(v) {
				return nil, false
			}
			seen[v] = true
			out = append(out, v)
		}
	}
	return out, true
}

// selectedTotal suma los conteos por estado de los valores elegidos; sin
// filtro, devuelve el total general (clave "").
func selectedTotal(totals map[string]int64, selected []string) int64 {
	if len(selected) == 0 {
		return totals[""]
	}
	var sum int64
	for _, v := range selected {
		sum += totals[v]
	}
	return sum
}

// dateRange lee ?from=AAAA-MM-DD&to=AAAA-MM-DD. Ambos son opcionales e
// inclusivos, y se comparan con la fecha en hora de El Salvador.
func dateRange(r *http.Request) (from, to pgtype.Date, err error) {
	parse := func(key string) (pgtype.Date, error) {
		raw := strings.TrimSpace(r.URL.Query().Get(key))
		if raw == "" {
			return pgtype.Date{}, nil
		}
		t, err := time.Parse(time.DateOnly, raw)
		if err != nil {
			return pgtype.Date{}, badRequest("Fecha inválida: usá el formato AAAA-MM-DD")
		}
		return pgtype.Date{Time: t, Valid: true}, nil
	}
	if from, err = parse("from"); err != nil {
		return
	}
	if to, err = parse("to"); err != nil {
		return
	}
	if from.Valid && to.Valid && from.Time.After(to.Time) {
		err = badRequest("La fecha inicial no puede ser posterior a la final")
	}
	return
}
