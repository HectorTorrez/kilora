package httpserver

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/shopspring/decimal"
	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/history"
	"kilora/api/internal/values"
)

var errNoJobs = conflict("Agrega al menos un trabajo antes de marcar como listo")

func publishOrder(ctx context.Context, q *sqlc.Queries, wc workshopAccess, o sqlc.WorkOrder) error {
	jobs, err := q.ListJobsByWorkOrder(ctx, sqlc.ListJobsByWorkOrderParams{WorkOrderID: o.ID, WorkshopID: o.WorkshopID})
	if err != nil {
		return err
	}
	if len(jobs) == 0 {
		return errNoJobs
	}
	parts, err := q.ListPartsByWorkOrder(ctx, sqlc.ListPartsByWorkOrderParams{WorkOrderID: o.ID, WorkshopID: o.WorkshopID})
	if err != nil {
		return err
	}
	items := make([]history.Item, 0, len(jobs)+len(parts))
	total, cost := decimal.Zero, decimal.Zero
	descriptions := make([]string, 0, len(jobs))
	for _, j := range jobs {
		descriptions = append(descriptions, j.Description)
		var category *string
		if j.Category != nil {
			c := string(*j.Category)
			category = &c
		}
		items = append(items, history.Item{Kind: "trabajo", Description: j.Description, Category: category, Price: fixedAmount(j.LaborPrice), InternalCost: fixedAmount(j.InternalCost), MechanicNotes: j.MechanicNotes})
		total = total.Add(amount(j.LaborPrice))
		cost = cost.Add(amount(j.InternalCost))
		for _, p := range parts {
			if p.JobID != j.ID {
				continue
			}
			quantity, _ := amount(p.Quantity).Float64()
			var price *string
			if p.UnitPrice.Valid {
				line := values.LineTotal(amount(p.Quantity), amount(p.UnitPrice))
				text := line.StringFixed(2)
				price = &text
				total = total.Add(line)
			}
			cost = cost.Add(amount(p.InternalCost))
			name := p.Name
			items = append(items, history.Item{Kind: "pieza", Name: &name, Description: p.Name, Brand: p.Brand, Model: p.Model, Quantity: &quantity, Price: price, InternalCost: fixedAmount(p.InternalCost)})
		}
	}
	data, err := json.Marshal(items)
	if err != nil {
		return err
	}
	summary := strings.TrimSpace(o.Reason)
	if summary == "" {
		summary = strings.Join(descriptions, ", ")
	}
	rec, err := q.CreateHistoryRecord(ctx, sqlc.CreateHistoryRecordParams{VehicleID: o.VehicleID, WorkshopID: &o.WorkshopID, WorkOrderID: &o.ID, Source: sqlc.HistorySourceTaller, PerformedOn: date(values.Today()), OdometerKm: o.OdometerKm, Summary: summary, Items: data, Total: dbNumeric(total), Currency: values.Currency, WorkshopNotes: o.PublicNotes, InternalCost: dbNumeric(cost), InternalNotes: o.InternalNotes, CreatedBy: &wc.userID})
	if err != nil {
		return err
	}
	return recordAudit(ctx, q, wc.event("history_record", rec.ID, "history.publish"))
}
