package httpserver

import (
	"context"

	"github.com/google/uuid"
	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/history"
)

type duplicateService struct {
	ID           uuid.UUID `json:"id"`
	PerformedOn  string    `json:"performed_on"`
	Summary      string    `json:"summary"`
	WorkshopName string    `json:"workshop_name"`
	Total        *string   `json:"total"`
	Reason       string    `json:"reason"`
}

type duplicateServiceError struct{ Matches []duplicateService }

func (e *duplicateServiceError) Error() string {
	return "Este servicio podría estar registrado. Revisá las coincidencias antes de guardarlo otra vez."
}

func findDuplicateServices(ctx context.Context, q *sqlc.Queries, params sqlc.FindDuplicateOwnerServicesParams, workshop string) ([]duplicateService, error) {
	candidates, err := q.FindDuplicateOwnerServices(ctx, params)
	if err != nil {
		return nil, err
	}
	rows := make([]sqlc.HistoryRecord, 0, len(candidates))
	sameReceipt := map[uuid.UUID]bool{}
	for _, candidate := range candidates {
		rows = append(rows, candidate.HistoryRecord)
		sameReceipt[candidate.HistoryRecord.ID] = candidate.SameReceipt
	}
	records, err := projectHistory(ctx, q, history.Viewer{IsOwner: true}, rows, nil)
	if err != nil {
		return nil, err
	}
	matches := []duplicateService{}
	name := normalizeHistoryText(workshop)
	for _, record := range records {
		reason := "details"
		if sameReceipt[record.ID] {
			reason = "receipt"
		} else if name == "" || normalizeHistoryText(historyWorkshop(record)) != name {
			continue
		}
		matches = append(matches, duplicateService{ID: record.ID, PerformedOn: record.PerformedOn, Summary: record.Summary, WorkshopName: historyWorkshop(record), Total: record.Total, Reason: reason})
		if len(matches) == 5 {
			break
		}
	}
	return matches, nil
}
