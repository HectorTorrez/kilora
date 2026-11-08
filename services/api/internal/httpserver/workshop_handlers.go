package httpserver

import (
	"github.com/google/uuid"
	"kilora/api/internal/database"
	"kilora/api/internal/database/sqlc"
	"net/http"
	"strings"
)

func (s *server) createWorkshop(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name       string  `json:"name"`
		NIT        *string `json:"nit"`
		BranchName string  `json:"branch_name"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	in.BranchName = strings.TrimSpace(in.BranchName)
	if in.Name == "" || in.BranchName == "" {
		fail(w, 400, "Nombre de taller y sucursal son obligatorios")
		return
	}
	u := currentUser(r.Context())
	var id, bid uuid.UUID
	err := database.WithTx(r.Context(), s.db, func(q *sqlc.Queries) error {
		workshop, err := q.CreateWorkshop(r.Context(), sqlc.CreateWorkshopParams{Name: in.Name, Nit: in.NIT})
		if err != nil {
			return err
		}
		id = uuid.UUID(workshop.ID.Bytes)
		branch, err := q.CreateBranch(r.Context(), sqlc.CreateBranchParams{WorkshopID: workshop.ID, Name: in.BranchName})
		if err != nil {
			return err
		}
		bid = uuid.UUID(branch.ID.Bytes)
		_, err = q.CreateMembership(r.Context(), sqlc.CreateMembershipParams{UserID: dbUUID(u.ID), WorkshopID: workshop.ID, BranchID: branch.ID, Role: sqlc.MembershipRoleAdmin})
		if err != nil {
			return err
		}
		_, err = q.InsertAuditEvent(r.Context(), sqlc.InsertAuditEventParams{ActorUserID: dbUUID(u.ID), WorkshopID: workshop.ID, EntityID: workshop.ID, Entity: "workshop", Action: "workshop.create"})
		return err
	})
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	writeJSON(w, 201, map[string]any{"id": id, "name": in.Name, "nit": in.NIT, "branch_id": bid})
}
func (s *server) getWorkshop(w http.ResponseWriter, r *http.Request) {
	wc, _ := CurrentWorkshop(r.Context())
	q := sqlc.New(s.db)
	workshop, err := q.GetWorkshop(r.Context(), dbUUID(wc.WorkshopID))
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	rows, err := q.ListBranchesByWorkshop(r.Context(), dbUUID(wc.WorkshopID))
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	branches := []map[string]any{}
	for _, row := range rows {
		for _, id := range wc.BranchIDs {
			if row.ID.Bytes == id {
				branches = append(branches, map[string]any{"id": uuid.UUID(row.ID.Bytes), "name": row.Name})
				break
			}
		}
	}
	writeJSON(w, 200, map[string]any{"workshop": map[string]any{"id": wc.WorkshopID, "name": workshop.Name, "nit": workshop.Nit}, "branches": branches})
}
