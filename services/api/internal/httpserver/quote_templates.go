package httpserver

import (
	"context"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"kilora/api/internal/database/sqlc"
)

const (
	quoteTemplateNotFound  = "Plantilla no encontrada"
	quoteTemplateDuplicate = "Ya existe una plantilla con ese nombre"
	maxQuoteTemplates      = 200
	maxQuoteTemplateItems  = 100
)

type quoteTemplateDTO struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Items     []any     `json:"items"`
	UpdatedAt time.Time `json:"updated_at"`
}

type quoteTemplateInput struct {
	name  string
	items []parsedQuoteItem
}

func parseQuoteTemplate(r *http.Request) (quoteTemplateInput, error) {
	var in struct {
		Name  string           `json:"name"`
		Items []quoteInputItem `json:"items"`
	}
	if err := decode(r, &in); err != nil {
		return quoteTemplateInput{}, err
	}
	name := strings.TrimSpace(in.Name)
	if name == "" || utf8.RuneCountInString(name) > 100 {
		return quoteTemplateInput{}, badRequest("El nombre es obligatorio y admite hasta 100 caracteres")
	}
	if len(in.Items) > maxQuoteTemplateItems {
		return quoteTemplateInput{}, badRequest("Una plantilla admite hasta 100 ítems")
	}
	items, _, err := parseQuoteItems(in.Items)
	if err != nil {
		return quoteTemplateInput{}, err
	}
	return quoteTemplateInput{name, items}, nil
}

func replaceQuoteTemplateItems(ctx context.Context, q *sqlc.Queries, id uuid.UUID, items []parsedQuoteItem) error {
	if err := q.DeleteQuoteTemplateItems(ctx, id); err != nil {
		return err
	}
	for i, v := range items {
		if err := q.CreateQuoteTemplateItem(ctx, sqlc.CreateQuoteTemplateItemParams{TemplateID: id, Position: int32(i), Kind: v.kind, Description: v.description, Quantity: v.quantity, UnitPrice: v.price, Part: v.part, Brand: v.brand}); err != nil {
			return err
		}
	}
	return nil
}

func (s *server) listQuoteTemplateDTOs(ctx context.Context, workshopID uuid.UUID) ([]quoteTemplateDTO, error) {
	q := sqlc.New(s.db)
	rows, err := q.ListQuoteTemplates(ctx, workshopID)
	if err != nil {
		return nil, err
	}
	items, err := q.ListQuoteTemplateItems(ctx, workshopID)
	if err != nil {
		return nil, err
	}
	byTemplate := map[uuid.UUID][]any{}
	for _, v := range items {
		byTemplate[v.TemplateID] = append(byTemplate[v.TemplateID], map[string]any{"kind": v.Kind, "description": v.Description, "quantity": v.Quantity, "unit_price": v.UnitPrice, "part": v.Part, "brand": v.Brand})
	}
	out := make([]quoteTemplateDTO, 0, len(rows))
	for _, v := range rows {
		list := byTemplate[v.ID]
		if list == nil {
			list = []any{}
		}
		out = append(out, quoteTemplateDTO{ID: v.ID, Name: v.Name, Items: list, UpdatedAt: v.UpdatedAt.Time})
	}
	return out, nil
}

func (s *server) findQuoteTemplateDTO(ctx context.Context, workshopID, id uuid.UUID) (quoteTemplateDTO, error) {
	list, err := s.listQuoteTemplateDTOs(ctx, workshopID)
	if err != nil {
		return quoteTemplateDTO{}, err
	}
	for _, v := range list {
		if v.ID == id {
			return v, nil
		}
	}
	return quoteTemplateDTO{}, notFound(quoteTemplateNotFound)
}

func (s *server) listQuoteTemplates(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	list, err := s.listQuoteTemplateDTOs(r.Context(), wc.workshopID)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": list})
	return nil
}

func templateWriteError(err error) error {
	if isUniqueViolation(err) {
		return conflict(quoteTemplateDuplicate)
	}
	return err
}

func (s *server) createQuoteTemplate(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	if err := wc.requireWriter(); err != nil {
		return err
	}
	in, err := parseQuoteTemplate(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	var id uuid.UUID
	err = s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		count, err := q.CountQuoteTemplates(ctx, wc.workshopID)
		if err != nil {
			return auditEvent{}, err
		}
		if count >= maxQuoteTemplates {
			return auditEvent{}, conflict("El taller ya tiene 200 plantillas; eliminá alguna para crear otra")
		}
		row, err := q.CreateQuoteTemplate(ctx, sqlc.CreateQuoteTemplateParams{WorkshopID: wc.workshopID, Name: in.name, CreatedBy: wc.userID})
		if err != nil {
			return auditEvent{}, err
		}
		id = row.ID
		if err = replaceQuoteTemplateItems(ctx, q, id, in.items); err != nil {
			return auditEvent{}, err
		}
		return wc.event("quote_template", id, "quote_template.create"), nil
	})
	if err != nil {
		return templateWriteError(err)
	}
	out, err := s.findQuoteTemplateDTO(ctx, wc.workshopID, id)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, out)
	return nil
}

func (s *server) updateQuoteTemplate(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	if err := wc.requireWriter(); err != nil {
		return err
	}
	id, err := pathID(r, "templateID", quoteTemplateNotFound)
	if err != nil {
		return err
	}
	in, err := parseQuoteTemplate(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	err = s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		// The UPDATE locks the row, so concurrent edits of the same template serialize.
		if _, err := q.UpdateQuoteTemplate(ctx, sqlc.UpdateQuoteTemplateParams{ID: id, WorkshopID: wc.workshopID, Name: in.name}); err != nil {
			return auditEvent{}, notFoundIfMissing(err, quoteTemplateNotFound)
		}
		if err := replaceQuoteTemplateItems(ctx, q, id, in.items); err != nil {
			return auditEvent{}, err
		}
		return wc.event("quote_template", id, "quote_template.update"), nil
	})
	if err != nil {
		return templateWriteError(err)
	}
	out, err := s.findQuoteTemplateDTO(ctx, wc.workshopID, id)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, out)
	return nil
}

func (s *server) deleteQuoteTemplate(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	if err := wc.requireWriter(); err != nil {
		return err
	}
	id, err := pathID(r, "templateID", quoteTemplateNotFound)
	if err != nil {
		return err
	}
	ctx := r.Context()
	err = s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		n, err := q.DeleteQuoteTemplate(ctx, sqlc.DeleteQuoteTemplateParams{ID: id, WorkshopID: wc.workshopID})
		if err != nil {
			return auditEvent{}, err
		}
		if n == 0 {
			return auditEvent{}, notFound(quoteTemplateNotFound)
		}
		return wc.event("quote_template", id, "quote_template.delete"), nil
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
