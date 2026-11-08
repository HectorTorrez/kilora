package httpserver

import (
	"net/http"
	"strings"
	"unicode"

	"github.com/google/uuid"
	"kilora/api/internal/database/sqlc"
)

func (s *server) listOrdersPage(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	limit, offset, err := pageWindow(r)
	if err != nil {
		return err
	}
	var status *sqlc.WorkOrderStatus
	if value := r.URL.Query().Get("status"); value != "" {
		parsed := sqlc.WorkOrderStatus(value)
		if !parsed.Valid() {
			return badRequest("Estado inválido")
		}
		status = &parsed
	}
	var branch *uuid.UUID
	if value := r.URL.Query().Get("branch_id"); value != "" {
		parsed, err := uuid.Parse(value)
		if err != nil {
			return badRequest("Sucursal inválida")
		}
		branch = &parsed
	}
	search := searchPattern(r.URL.Query().Get("q"))
	q := sqlc.New(s.db)
	counts, err := q.CountWorkOrdersByStatus(r.Context(), sqlc.CountWorkOrdersByStatusParams{WorkshopID: wc.workshopID, BranchIds: wc.branchIDs, BranchID: branch, Search: search})
	if err != nil {
		return err
	}
	totals := map[string]int64{"": 0}
	for _, count := range counts {
		totals[string(count.Status)] = count.Total
		totals[""] += count.Total
	}
	rows, err := q.ListWorkOrdersPage(r.Context(), sqlc.ListWorkOrdersPageParams{WorkshopID: wc.workshopID, BranchIds: wc.branchIDs, BranchID: branch, Search: search, Status: status, RowLimit: limit, RowOffset: offset})
	if err != nil {
		return err
	}
	items := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		v := row.WorkOrder
		items = append(items, map[string]any{"id": v.ID, "branch_id": v.BranchID, "vehicle_id": v.VehicleID, "number": v.Number, "status": v.Status, "reason": v.Reason, "plate": row.Plate, "make": row.Make, "model": row.Model, "received_at": v.ReceivedAt.Time})
	}
	key := ""
	if status != nil {
		key = string(*status)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": totals[key], "counts": totals})
	return nil
}

func (s *server) listVehiclesPage(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	limit, offset, err := pageWindow(r)
	if err != nil {
		return err
	}
	var status *sqlc.VehicleStatus
	if value := r.URL.Query().Get("status"); value != "" {
		parsed := sqlc.VehicleStatus(value)
		if parsed != sqlc.VehicleStatusProvisional && parsed != sqlc.VehicleStatusVinculado {
			return badRequest("Estado inválido")
		}
		status = &parsed
	}
	normalized := strings.Map(func(r rune) rune {
		if r == '-' || unicode.IsSpace(r) {
			return -1
		}
		return r
	}, strings.TrimSpace(r.URL.Query().Get("q")))
	search := searchPattern(normalized)
	q := sqlc.New(s.db)
	counts, err := q.CountVehiclesByStatus(r.Context(), sqlc.CountVehiclesByStatusParams{WorkshopID: wc.workshopID, Search: search})
	if err != nil {
		return err
	}
	totals := map[string]int64{"": 0}
	for _, count := range counts {
		totals[string(count.Status)] = count.Total
		totals[""] += count.Total
	}
	rows, err := q.ListVehiclesPage(r.Context(), sqlc.ListVehiclesPageParams{WorkshopID: wc.workshopID, Search: search, Status: status, RowLimit: limit, RowOffset: offset})
	if err != nil {
		return err
	}
	ids := make([]uuid.UUID, 0, len(rows))
	for _, v := range rows {
		ids = append(ids, v.ID)
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
	for _, v := range rows {
		items = append(items, vehicleDTO(v, latest[v.ID]))
	}
	key := ""
	if status != nil {
		key = string(*status)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": totals[key], "counts": totals})
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
