package httpserver

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	decimalpkg "github.com/shopspring/decimal"
	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/history"
)

var errNoJobs = errors.New("sin trabajos")

func money(n pgtype.Numeric) decimalpkg.Decimal {
	if !n.Valid {
		return decimalpkg.Zero
	}
	d, _ := decimalpkg.NewFromString(stringValue(n))
	return d
}
func moneyPtr(n pgtype.Numeric) *string {
	if !n.Valid {
		return nil
	}
	s := money(n).StringFixed(2)
	return &s
}
func dbMoney(d decimalpkg.Decimal) pgtype.Numeric {
	var n pgtype.Numeric
	_ = n.Scan(d.StringFixed(2))
	return n
}

func publishOrder(ctx context.Context, q *sqlc.Queries, wc WorkshopContext, o sqlc.WorkOrder) error {
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
	total, cost := decimalpkg.Zero, decimalpkg.Zero
	descriptions := make([]string, 0, len(jobs))
	for _, j := range jobs {
		descriptions = append(descriptions, j.Description)
		var category *string
		if j.Category != nil {
			c := string(*j.Category)
			category = &c
		}
		items = append(items, history.Item{Kind: "trabajo", Description: j.Description, Category: category, Price: moneyPtr(j.LaborPrice), InternalCost: moneyPtr(j.InternalCost), MechanicNotes: j.MechanicNotes})
		total = total.Add(money(j.LaborPrice))
		cost = cost.Add(money(j.InternalCost))
		for _, p := range parts {
			if p.JobID != j.ID {
				continue
			}
			quantity, _ := money(p.Quantity).Float64()
			var price *string
			if p.UnitPrice.Valid {
				v := money(p.Quantity).Mul(money(p.UnitPrice)).Round(2)
				s := v.StringFixed(2)
				price = &s
				total = total.Add(v)
			}
			cost = cost.Add(money(p.InternalCost))
			name := p.Name
			items = append(items, history.Item{Kind: "pieza", Name: &name, Description: p.Name, Brand: p.Brand, Model: p.Model, Quantity: &quantity, Price: price, InternalCost: moneyPtr(p.InternalCost)})
		}
	}
	data, err := history.EncodeItems(items)
	if err != nil {
		return err
	}
	summary := strings.TrimSpace(o.Reason)
	if summary == "" {
		summary = strings.Join(descriptions, ", ")
	}
	loc, err := time.LoadLocation("America/El_Salvador")
	if err != nil {
		return err
	}
	now := time.Now().In(loc)
	date := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	rec, err := q.CreateHistoryRecord(ctx, sqlc.CreateHistoryRecordParams{VehicleID: o.VehicleID, WorkshopID: o.WorkshopID, WorkOrderID: o.ID, Source: sqlc.HistorySourceTaller, PerformedOn: pgtype.Date{Time: date, Valid: true}, OdometerKm: o.OdometerKm, Summary: summary, Items: data, Total: dbMoney(total), Currency: "USD", WorkshopNotes: o.PublicNotes, InternalCost: dbMoney(cost), InternalNotes: o.InternalNotes, CreatedBy: dbUUID(wc.UserID)})
	if err != nil {
		return err
	}
	return audit(ctx, q, wc, rec.ID, "history_record", "history.publish")
}
