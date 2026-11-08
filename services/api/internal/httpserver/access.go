package httpserver

import (
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
	adminBranchIDs     []uuid.UUID
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

func contains(ids []uuid.UUID, id uuid.UUID) bool {
	for _, v := range ids {
		if v == id {
			return true
		}
	}
	return false
}

func (a workshopAccess) canReadBranch(id uuid.UUID) bool  { return contains(a.branchIDs, id) }
func (a workshopAccess) canWriteBranch(id uuid.UUID) bool { return contains(a.writeBranchIDs, id) }

// requireWriter covers workshop-wide records such as vehicles, which do not belong to a branch.
func (a workshopAccess) requireWriter() error {
	if len(a.writeBranchIDs) == 0 {
		return errAccessDenied
	}
	return nil
}

func (a workshopAccess) requireBranchWriter(id uuid.UUID) error {
	if !a.canWriteBranch(id) {
		return errAccessDenied
	}
	return nil
}

func (a workshopAccess) requireBranchAdmin(id uuid.UUID) error {
	if !contains(a.adminBranchIDs, id) {
		return forbidden("Solo un administrador puede hacer esto")
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
