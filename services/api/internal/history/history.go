package history

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"kilora/api/internal/database/sqlc"
)

type Item struct {
	Kind          string   `json:"kind"`
	Description   string   `json:"description"`
	Name          *string  `json:"name,omitempty"`
	Category      *string  `json:"category,omitempty"`
	Brand         *string  `json:"brand,omitempty"`
	Model         *string  `json:"model,omitempty"`
	Quantity      *float64 `json:"quantity,omitempty"`
	Price         *string  `json:"price,omitempty"`
	InternalCost  *string  `json:"internal_cost,omitempty"`
	MechanicNotes *string  `json:"mechanic_notes,omitempty"`
}

func DecodeItems(data []byte) ([]Item, error) {
	var items []Item
	err := json.Unmarshal(data, &items)
	return items, err
}
func EncodeItems(items []Item) ([]byte, error) { return json.Marshal(items) }

type ViewerKind int

const (
	ViewerOwner ViewerKind = iota
	ViewerAuthorWorkshop
	ViewerLinkedWorkshop
	ViewerNone
)

type Viewer struct {
	UserID         *uuid.UUID
	WorkshopID     *uuid.UUID
	WorkshopLinked bool
	IsOwner        bool
}
type Correction struct {
	ID        uuid.UUID
	Reason    string
	Changes   map[string]json.RawMessage
	CreatedBy uuid.UUID
	CreatedAt time.Time
}
type Record struct {
	ID            uuid.UUID
	WorkshopID    *uuid.UUID
	WorkshopName  *string
	Source        string
	PerformedOn   time.Time
	OdometerKm    *int32
	Summary       string
	Items         []Item
	Total         *string
	Currency      string
	WorkshopNotes *string
	InternalCost  *string
	InternalNotes *string
	CreatedBy     *uuid.UUID
	Corrections   []Correction
}
type ProjectedCorrection struct {
	ID        uuid.UUID                  `json:"id"`
	Changes   map[string]json.RawMessage `json:"changes"`
	CreatedAt time.Time                  `json:"created_at"`
	Reason    *string                    `json:"reason,omitempty"`
	CreatedBy *uuid.UUID                 `json:"created_by,omitempty"`
}
type Projected struct {
	ID            uuid.UUID             `json:"id"`
	PerformedOn   string                `json:"performed_on"`
	OdometerKm    *int32                `json:"odometer_km,omitempty"`
	Source        string                `json:"source"`
	Summary       string                `json:"summary"`
	Items         []Item                `json:"items"`
	Total         *string               `json:"total,omitempty"`
	Currency      *string               `json:"currency,omitempty"`
	WorkshopID    *uuid.UUID            `json:"workshop_id,omitempty"`
	WorkshopName  *string               `json:"workshop_name,omitempty"`
	WorkshopNotes *string               `json:"workshop_notes,omitempty"`
	InternalCost  *string               `json:"internal_cost,omitempty"`
	InternalNotes *string               `json:"internal_notes,omitempty"`
	CreatedBy     *uuid.UUID            `json:"created_by,omitempty"`
	Corrections   []ProjectedCorrection `json:"corrections,omitempty"`
}

func ResolveViewer(rec Record, v Viewer) ViewerKind {
	if rec.Source != "propietario" && rec.WorkshopID != nil && v.WorkshopID != nil && *rec.WorkshopID == *v.WorkshopID {
		return ViewerAuthorWorkshop
	}
	if v.IsOwner {
		return ViewerOwner
	}
	if v.WorkshopID != nil && v.WorkshopLinked {
		return ViewerLinkedWorkshop
	}
	return ViewerNone
}
func filterItems(items []Item, kind ViewerKind) []Item {
	out := make([]Item, len(items))
	for i, item := range items {
		if kind != ViewerAuthorWorkshop {
			item.InternalCost = nil
			item.MechanicNotes = nil
		}
		if kind == ViewerLinkedWorkshop {
			item.Brand = nil
			item.Model = nil
			item.Quantity = nil
			item.Price = nil
		}
		out[i] = item
	}
	return out
}
func filteredChanges(changes map[string]json.RawMessage, kind ViewerKind) map[string]json.RawMessage {
	out := make(map[string]json.RawMessage)
	for k, v := range changes {
		if kind == ViewerAuthorWorkshop {
			out[k] = v
			continue
		}
		switch k {
		case "performed_on", "summary":
			var value *string
			if json.Unmarshal(v, &value) == nil {
				out[k] = v
			}
		case "odometer_km":
			var value *int32
			if json.Unmarshal(v, &value) == nil {
				out[k] = v
			}
		case "items":
			items, err := DecodeItems(v)
			if err == nil {
				b, err := EncodeItems(filterItems(items, kind))
				if err == nil {
					out[k] = b
				}
			}
		case "total", "currency", "workshop_id", "workshop_name", "workshop_notes":
			if kind == ViewerOwner {
				var value *string
				if json.Unmarshal(v, &value) == nil {
					out[k] = v
				}
			}
		}
	}
	return out
}
func Project(kind ViewerKind, rec Record) (Projected, bool) {
	if kind != ViewerOwner && kind != ViewerAuthorWorkshop && kind != ViewerLinkedWorkshop {
		return Projected{}, false
	}
	p := Projected{ID: rec.ID, PerformedOn: rec.PerformedOn.Format("2006-01-02"), OdometerKm: rec.OdometerKm, Source: rec.Source, Summary: rec.Summary, Items: filterItems(rec.Items, kind)}
	if kind != ViewerLinkedWorkshop {
		p.Total = rec.Total
		p.Currency = &rec.Currency
		p.WorkshopID = rec.WorkshopID
		p.WorkshopName = rec.WorkshopName
		p.WorkshopNotes = rec.WorkshopNotes
	}
	if kind == ViewerAuthorWorkshop {
		p.InternalCost = rec.InternalCost
		p.InternalNotes = rec.InternalNotes
		p.CreatedBy = rec.CreatedBy
	}
	// Los registros manuales pertenecen al propietario, incluidos sus campos internos.
	if kind == ViewerOwner && rec.Source == "propietario" {
		p.InternalCost = rec.InternalCost
		p.InternalNotes = rec.InternalNotes
		p.CreatedBy = rec.CreatedBy
		p.Items = filterItems(rec.Items, ViewerAuthorWorkshop)
	}
	for _, c := range rec.Corrections {
		ck := kind
		if kind == ViewerOwner && rec.Source == "propietario" {
			ck = ViewerAuthorWorkshop
		}
		changes := filteredChanges(c.Changes, ck)
		if len(changes) == 0 && kind == ViewerLinkedWorkshop {
			continue
		}
		pc := ProjectedCorrection{ID: c.ID, Changes: changes, CreatedAt: c.CreatedAt}
		if kind != ViewerLinkedWorkshop {
			pc.Reason = &c.Reason
			pc.CreatedBy = &c.CreatedBy
		}
		p.Corrections = append(p.Corrections, pc)
	}
	return p, true
}
func ProjectAll(kind ViewerKind, records []Record) []Projected {
	out := make([]Projected, 0, len(records))
	for _, r := range records {
		if p, ok := Project(kind, r); ok {
			out = append(out, p)
		}
	}
	return out
}
func uuidPtr(id pgtype.UUID) *uuid.UUID {
	if !id.Valid {
		return nil
	}
	v := uuid.UUID(id.Bytes)
	return &v
}
func numeric(n pgtype.Numeric) (*string, error) {
	if !n.Valid {
		return nil, nil
	}
	v, err := n.Value()
	if err != nil {
		return nil, err
	}
	s, ok := v.(string)
	if !ok {
		return nil, fmt.Errorf("numeric inesperado: %T", v)
	}
	return &s, nil
}
func FromSQLC(r sqlc.HistoryRecord, workshopName *string, corrections []sqlc.Correction) (Record, error) {
	items, err := DecodeItems(r.Items)
	if err != nil {
		return Record{}, err
	}
	total, err := numeric(r.Total)
	if err != nil {
		return Record{}, err
	}
	cost, err := numeric(r.InternalCost)
	if err != nil {
		return Record{}, err
	}
	out := Record{ID: uuid.UUID(r.ID.Bytes), WorkshopID: uuidPtr(r.WorkshopID), WorkshopName: workshopName, Source: string(r.Source), PerformedOn: r.PerformedOn.Time, OdometerKm: r.OdometerKm, Summary: r.Summary, Items: items, Total: total, Currency: r.Currency, WorkshopNotes: r.WorkshopNotes, InternalCost: cost, InternalNotes: r.InternalNotes, CreatedBy: uuidPtr(r.CreatedBy)}
	for _, c := range corrections {
		var changes map[string]json.RawMessage
		if err := json.Unmarshal(c.Changes, &changes); err != nil {
			return Record{}, err
		}
		out.Corrections = append(out.Corrections, Correction{ID: uuid.UUID(c.ID.Bytes), Reason: c.Reason, Changes: changes, CreatedBy: uuid.UUID(c.CreatedBy.Bytes), CreatedAt: c.CreatedAt.Time})
	}
	return out, nil
}
