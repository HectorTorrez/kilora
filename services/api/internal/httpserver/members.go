package httpserver

import (
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"kilora/api/internal/database/sqlc"
)

func (s *server) listMembers(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	rows, err := sqlc.New(s.db).ListMembersByWorkshop(r.Context(), wc.workshopID)
	if err != nil {
		return err
	}
	out := make([]map[string]any, 0, len(rows))
	for _, m := range rows {
		out = append(out, map[string]any{"id": m.ID, "user_id": m.UserID, "full_name": m.FullName, "email": m.Email, "branch_id": m.BranchID, "branch_name": m.BranchName, "role": m.Role, "created_at": m.CreatedAt.Time})
	}
	writeJSON(w, http.StatusOK, out)
	return nil
}

func (s *server) addMember(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	if err := wc.requireAdmin(); err != nil {
		return err
	}
	var in struct {
		Email    string              `json:"email"`
		BranchID uuid.UUID           `json:"branch_id"`
		Role     sqlc.MembershipRole `json:"role"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	if !in.Role.Valid() {
		return badRequest("Rol inválido")
	}
	if err := wc.requireBranchAdmin(in.BranchID); err != nil {
		return err
	}
	ctx := r.Context()
	user, err := sqlc.New(s.db).GetUserByEmail(ctx, normalizedEmail(in.Email))
	if err != nil {
		return notFoundIfMissing(err, "No existe una cuenta con ese correo. Pedile que se registre primero.")
	}
	var membershipID uuid.UUID
	err = s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		branch, err := q.GetBranch(ctx, sqlc.GetBranchParams{ID: in.BranchID, WorkshopID: wc.workshopID})
		if err != nil {
			return auditEvent{}, notFoundIfMissing(err, "Sucursal no encontrada")
		}
		m, err := q.CreateMembership(ctx, sqlc.CreateMembershipParams{UserID: user.ID, WorkshopID: wc.workshopID, BranchID: branch.ID, Role: in.Role})
		membershipID = m.ID
		return wc.event("membership", m.ID, "membership.create"), err
	})
	if isUniqueViolation(err) {
		return conflict("Esa persona ya es miembro de la sucursal")
	}
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": membershipID})
	return nil
}

func (s *server) removeMember(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	if err := wc.requireAdmin(); err != nil {
		return err
	}
	id, err := pathID(r, "membershipID", "Miembro no encontrado")
	if err != nil {
		return err
	}
	ctx := r.Context()
	err = s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		m, err := q.GetMembershipInWorkshop(ctx, sqlc.GetMembershipInWorkshopParams{ID: id, WorkshopID: wc.workshopID})
		if err != nil {
			return auditEvent{}, notFoundIfMissing(err, "Miembro no encontrado")
		}
		if err = wc.requireBranchAdmin(m.BranchID); err != nil {
			return auditEvent{}, err
		}
		if m.Role == sqlc.MembershipRoleAdmin {
			n, err := q.CountAdmins(ctx, wc.workshopID)
			if err != nil {
				return auditEvent{}, err
			}
			if n <= 1 {
				return auditEvent{}, conflict("El taller necesita al menos un administrador")
			}
		}
		_, err = q.DeleteMembership(ctx, sqlc.DeleteMembershipParams{ID: m.ID, WorkshopID: wc.workshopID})
		return wc.event("membership", m.ID, "membership.delete"), err
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *server) listAudit(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	if err := wc.requireAdmin(); err != nil {
		return err
	}
	params := sqlc.ListAuditEventsByWorkshopParams{WorkshopID: &wc.workshopID, RowLimit: 50}
	if v := r.URL.Query().Get("before"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			return badRequest("Cursor inválido")
		}
		params.Before = &n
	}
	if v := r.URL.Query().Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 200 {
			return badRequest("Límite inválido")
		}
		params.RowLimit = int32(n)
	}
	rows, err := sqlc.New(s.db).ListAuditEventsByWorkshop(r.Context(), params)
	if err != nil {
		return err
	}
	out := make([]map[string]any, 0, len(rows))
	for _, a := range rows {
		out = append(out, map[string]any{"id": a.ID, "entity": a.Entity, "entity_id": a.EntityID, "action": a.Action, "actor_name": a.ActorName, "created_at": a.CreatedAt.Time})
	}
	writeJSON(w, http.StatusOK, out)
	return nil
}
