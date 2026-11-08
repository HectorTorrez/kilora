package httpserver

import (
	"context"
	"net/http"

	"github.com/google/uuid"
	"kilora/api/internal/database/sqlc"
)

type contextKey int

const (
	userKey contextKey = iota
	workshopKey
)

// workshopAccess is everything the API knows about what the current member may do.
type workshopAccess struct {
	userID, workshopID uuid.UUID
	role               sqlc.MembershipRole
	branchIDs          []uuid.UUID
	writeBranchIDs     []uuid.UUID
}

type workshopHandler func(w http.ResponseWriter, r *http.Request, wc workshopAccess) error

func (s *server) inWorkshop(fn workshopHandler) http.HandlerFunc {
	return s.handle(func(w http.ResponseWriter, r *http.Request) error {
		wc, ok := r.Context().Value(workshopKey).(workshopAccess)
		if !ok {
			return errAccessDenied
		}
		return fn(w, r, wc)
	})
}

func canWrite(role sqlc.MembershipRole) bool {
	return role == sqlc.MembershipRoleRecepcion || role == sqlc.MembershipRoleAdmin
}

func (a workshopAccess) canWriteBranch(id uuid.UUID) bool {
	if a.role == sqlc.MembershipRoleAdmin {
		return true
	}
	for _, b := range a.writeBranchIDs {
		if b == id {
			return true
		}
	}
	return false
}

func (a workshopAccess) requireWriter() error {
	if a.role == sqlc.MembershipRoleMecanico {
		return errAccessDenied
	}
	return nil
}

func (a workshopAccess) requireBranchWriter(id uuid.UUID) error {
	if err := a.requireWriter(); err != nil {
		return err
	}
	if !a.canWriteBranch(id) {
		return errAccessDenied
	}
	return nil
}

func (a workshopAccess) requireAdmin() error {
	if a.role != sqlc.MembershipRoleAdmin {
		return forbidden("Solo un administrador puede hacer esto")
	}
	return nil
}

func (a workshopAccess) event(entity string, id uuid.UUID, action string) auditEvent {
	workshop := a.workshopID
	return auditEvent{actor: a.userID, workshop: &workshop, entity: entity, id: id, action: action}
}

func (s *server) requireBranch(ctx context.Context, wc workshopAccess, id uuid.UUID) error {
	if !wc.canWriteBranch(id) {
		return errAccessDenied
	}
	_, err := sqlc.New(s.db).GetBranch(ctx, sqlc.GetBranchParams{ID: id, WorkshopID: wc.workshopID})
	return notFoundIfMissing(err, "Sucursal no encontrada")
}
