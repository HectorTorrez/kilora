package httpserver

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"kilora/api/internal/database"
	"kilora/api/internal/database/sqlc"
)

var errLastAdmin = errors.New("last admin")

func adminOnly(w http.ResponseWriter, wc WorkshopContext) bool {
	if wc.Role != "admin" {
		fail(w, 403, "Solo un administrador puede hacer esto")
		return false
	}
	return true
}

func (s *server) listMembers(w http.ResponseWriter, r *http.Request) {
	wc, _ := CurrentWorkshop(r.Context())
	rows, err := sqlc.New(s.db).ListMembersByWorkshop(r.Context(), dbUUID(wc.WorkshopID))
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for _, m := range rows {
		out = append(out, map[string]any{
			"id": uuid.UUID(m.ID.Bytes), "user_id": uuid.UUID(m.UserID.Bytes), "full_name": m.FullName, "email": m.Email,
			"branch_id": uuid.UUID(m.BranchID.Bytes), "branch_name": m.BranchName, "role": m.Role, "created_at": m.CreatedAt.Time,
		})
	}
	writeJSON(w, 200, out)
}

func (s *server) addMember(w http.ResponseWriter, r *http.Request) {
	wc, _ := CurrentWorkshop(r.Context())
	if !adminOnly(w, wc) {
		return
	}
	var in struct {
		Email    string    `json:"email"`
		BranchID uuid.UUID `json:"branch_id"`
		Role     string    `json:"role"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Role != "admin" && in.Role != "recepcion" && in.Role != "mecanico" {
		fail(w, 400, "Rol inválido")
		return
	}
	q := sqlc.New(s.db)
	user, err := q.GetUserByEmail(r.Context(), normalizedEmail(in.Email))
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 404, "No existe una cuenta con ese correo. Pedile que se registre primero.")
		return
	}
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	var membershipID uuid.UUID
	err = database.WithTx(r.Context(), s.db, func(q *sqlc.Queries) error {
		branch, err := q.GetBranch(r.Context(), sqlc.GetBranchParams{ID: dbUUID(in.BranchID), WorkshopID: dbUUID(wc.WorkshopID)})
		if err != nil {
			return err
		}
		m, err := q.CreateMembership(r.Context(), sqlc.CreateMembershipParams{UserID: user.ID, WorkshopID: dbUUID(wc.WorkshopID), BranchID: branch.ID, Role: sqlc.MembershipRole(in.Role)})
		if err != nil {
			return err
		}
		membershipID = uuid.UUID(m.ID.Bytes)
		return audit(r.Context(), q, wc, m.ID, "membership", "membership.create")
	})
	var pe *pgconn.PgError
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		fail(w, 404, "Sucursal no encontrada")
	case errors.As(err, &pe) && pe.Code == "23505":
		fail(w, 409, "Esa persona ya es miembro de la sucursal")
	case err != nil:
		fail(w, 500, "Error interno")
	default:
		writeJSON(w, 201, map[string]any{"id": membershipID})
	}
}

func (s *server) removeMember(w http.ResponseWriter, r *http.Request) {
	wc, _ := CurrentWorkshop(r.Context())
	if !adminOnly(w, wc) {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "membershipID"))
	if err != nil {
		fail(w, 404, "Miembro no encontrado")
		return
	}
	err = database.WithTx(r.Context(), s.db, func(q *sqlc.Queries) error {
		m, err := q.GetMembershipInWorkshop(r.Context(), sqlc.GetMembershipInWorkshopParams{ID: dbUUID(id), WorkshopID: dbUUID(wc.WorkshopID)})
		if err != nil {
			return err
		}
		if m.Role == sqlc.MembershipRoleAdmin {
			n, err := q.CountAdmins(r.Context(), dbUUID(wc.WorkshopID))
			if err != nil {
				return err
			}
			if n <= 1 {
				return errLastAdmin
			}
		}
		if err := audit(r.Context(), q, wc, m.ID, "membership", "membership.delete"); err != nil {
			return err
		}
		_, err = q.DeleteMembership(r.Context(), sqlc.DeleteMembershipParams{ID: m.ID, WorkshopID: dbUUID(wc.WorkshopID)})
		return err
	})
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		fail(w, 404, "Miembro no encontrado")
	case errors.Is(err, errLastAdmin):
		fail(w, 409, "El taller necesita al menos un administrador")
	case err != nil:
		fail(w, 500, "Error interno")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

func (s *server) listAudit(w http.ResponseWriter, r *http.Request) {
	wc, _ := CurrentWorkshop(r.Context())
	if !adminOnly(w, wc) {
		return
	}
	params := sqlc.ListAuditEventsByWorkshopParams{WorkshopID: dbUUID(wc.WorkshopID), RowLimit: 50}
	if v := r.URL.Query().Get("before"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			fail(w, 400, "Cursor inválido")
			return
		}
		params.Before = &n
	}
	if v := r.URL.Query().Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 200 {
			fail(w, 400, "Límite inválido")
			return
		}
		params.RowLimit = int32(n)
	}
	rows, err := sqlc.New(s.db).ListAuditEventsByWorkshop(r.Context(), params)
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for _, a := range rows {
		out = append(out, map[string]any{"id": a.ID, "entity": a.Entity, "entity_id": optUUID(a.EntityID), "action": a.Action, "actor_name": a.ActorName, "created_at": a.CreatedAt.Time})
	}
	writeJSON(w, 200, out)
}
