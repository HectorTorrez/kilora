package httpserver

import (
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/values"
)

const invalidNIT = "Ingresá un NIT de 14 dígitos o un DUI válido, con o sin guiones"

func (s *server) createWorkshop(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Name       string  `json:"name"`
		NIT        *string `json:"nit"`
		BranchName string  `json:"branch_name"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	in.Name, in.BranchName = strings.TrimSpace(in.Name), strings.TrimSpace(in.BranchName)
	if in.Name == "" || in.BranchName == "" {
		return badRequest("Nombre de taller y sucursal son obligatorios")
	}
	nit, ok := values.OptionalNIT(in.NIT)
	if !ok {
		return badRequest(invalidNIT)
	}
	in.NIT = nit
	ctx := r.Context()
	user := currentUser(ctx).ID
	var id, branchID uuid.UUID
	err := s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		workshop, err := q.CreateWorkshop(ctx, sqlc.CreateWorkshopParams{Name: in.Name, Nit: in.NIT})
		if err != nil {
			return auditEvent{}, err
		}
		branch, err := q.CreateBranch(ctx, sqlc.CreateBranchParams{WorkshopID: workshop.ID, Name: in.BranchName})
		if err != nil {
			return auditEvent{}, err
		}
		if _, err = q.CreateMembership(ctx, sqlc.CreateMembershipParams{UserID: user, WorkshopID: workshop.ID, BranchID: branch.ID, Role: sqlc.MembershipRoleAdmin}); err != nil {
			return auditEvent{}, err
		}
		id, branchID = workshop.ID, branch.ID
		return auditEvent{actor: user, workshop: &id, entity: "workshop", id: id, action: "workshop.create"}, nil
	})
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "name": in.Name, "nit": in.NIT, "branch_id": branchID})
	return nil
}

func (s *server) getWorkshop(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	q := sqlc.New(s.db)
	workshop, err := q.GetWorkshop(r.Context(), wc.workshopID)
	if err != nil {
		return err
	}
	rows, err := q.ListBranchesByWorkshop(r.Context(), wc.workshopID)
	if err != nil {
		return err
	}
	member := make(map[uuid.UUID]bool, len(wc.branchIDs))
	for _, id := range wc.branchIDs {
		member[id] = true
	}
	branches := []map[string]any{}
	for _, row := range rows {
		if member[row.ID] {
			branches = append(branches, map[string]any{"id": row.ID, "name": row.Name})
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"workshop": map[string]any{"id": wc.workshopID, "name": workshop.Name, "nit": workshop.Nit, "verified_at": nullableTime(workshop.VerifiedAt), "verified_by": workshop.VerifiedBy}, "role": wc.role, "branches": branches})
	return nil
}

func (s *server) updateWorkshop(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	if err := wc.requireAdmin(); err != nil {
		return err
	}
	var in struct {
		Name string  `json:"name"`
		NIT  *string `json:"nit"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" || utf8.RuneCountInString(in.Name) > 100 {
		return badRequest("Ingresá el nombre del taller (máximo 100 caracteres)")
	}
	nit, ok := values.OptionalNIT(in.NIT)
	if !ok {
		return badRequest(invalidNIT)
	}
	ctx := r.Context()
	var workshop sqlc.Workshop
	err := s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		var err error
		workshop, err = q.UpdateWorkshop(ctx, sqlc.UpdateWorkshopParams{WorkshopID: wc.workshopID, Name: in.Name, Nit: nit})
		return wc.event("workshop", wc.workshopID, "workshop.update"), err
	})
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": workshop.ID, "name": workshop.Name, "nit": workshop.Nit, "verified_at": nullableTime(workshop.VerifiedAt), "verified_by": workshop.VerifiedBy})
	return nil
}
