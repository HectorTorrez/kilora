package httpserver

import (
	"net/http"
	"strings"

	"kilora/api/internal/auth"
	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/values"
)

func (s *server) updateProfile(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		FullName string  `json:"full_name"`
		Phone    *string `json:"phone"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	in.FullName = strings.TrimSpace(in.FullName)
	phone, valid := values.OptionalPhone(in.Phone)
	if !values.PersonName(in.FullName) || !valid {
		return badRequest("Nombre o teléfono inválido")
	}
	u := currentUser(r.Context())
	if auth.IsDemoEmail(u.Email) {
		return forbidden("Las cuentas demo no pueden modificar su perfil")
	}
	err := s.mutate(r.Context(), func(q *sqlc.Queries) (auditEvent, error) {
		user, err := q.LockAccount(r.Context(), u.ID)
		if err != nil {
			return auditEvent{}, err
		}
		if !user.EmailVerifiedAt.Valid {
			return auditEvent{}, errAccessDenied
		}
		err = q.UpdateUserProfile(r.Context(), sqlc.UpdateUserProfileParams{ID: u.ID, FullName: in.FullName, Phone: phone})
		return auditEvent{actor: u.ID, entity: "user", id: u.ID, action: "user.profile_updated"}, err
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *server) changePassword(w http.ResponseWriter, r *http.Request) error {
	return s.accountCredentialChange(w, r, false)
}

func (s *server) deleteAccount(w http.ResponseWriter, r *http.Request) error {
	return s.accountCredentialChange(w, r, true)
}

func (s *server) accountCredentialChange(w http.ResponseWriter, r *http.Request, deleting bool) error {
	u := currentUser(r.Context())
	if auth.IsDemoEmail(u.Email) {
		return forbidden("Las cuentas demo no pueden cambiar su contraseña ni eliminarse")
	}
	if !s.limiter.allow("account:"+u.ID.String(), 10) {
		return errTooManyRequests
	}
	var in struct {
		CurrentPassword string `json:"current_password"`
		Password        string `json:"password"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	ctx := r.Context()
	err := s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		user, err := q.LockAccount(ctx, u.ID)
		if err != nil {
			return auditEvent{}, err
		}
		if !user.EmailVerifiedAt.Valid || !auth.VerifyPassword(in.CurrentPassword, user.PasswordHash) {
			return auditEvent{}, badRequest("La contraseña actual es incorrecta")
		}
		action := "user.password_changed"
		if deleting {
			memberships, err := q.ListMembershipsByUser(ctx, u.ID)
			if err != nil {
				return auditEvent{}, err
			}
			if len(memberships) > 0 {
				return auditEvent{}, conflict("Primero pedí que retiren tus membresías de los talleres. Si sos el único administrador, agregá otro antes de salir")
			}
			if err = q.UnlinkOwnerVehicles(ctx, &u.ID); err != nil {
				return auditEvent{}, err
			}
			if err = q.AnonymizeUser(ctx, u.ID); err != nil {
				return auditEvent{}, err
			}
			action = "user.deleted"
		} else {
			hash, err := auth.HashPassword(in.Password)
			if err != nil {
				return auditEvent{}, badRequest(err.Error())
			}
			if _, err = q.UpdateUserPassword(ctx, sqlc.UpdateUserPasswordParams{ID: u.ID, PasswordHash: hash}); err != nil {
				return auditEvent{}, err
			}
		}
		if err = q.DeleteUserAuthTokens(ctx, u.ID); err != nil {
			return auditEvent{}, err
		}
		if err = q.DeleteUserSessions(ctx, u.ID); err != nil {
			return auditEvent{}, err
		}
		return auditEvent{actor: u.ID, entity: "user", id: u.ID, action: action}, nil
	})
	if err != nil {
		return err
	}
	s.clearCookie(w)
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *server) updateEmailPreferences(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Enabled *bool `json:"maintenance_emails_enabled"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	if in.Enabled == nil {
		return badRequest("Indicá si querés permitir correos de mantenimiento")
	}
	u := currentUser(r.Context())
	if auth.IsDemoEmail(u.Email) {
		return forbidden("Las cuentas demo no pueden modificar sus preferencias")
	}
	ctx := r.Context()
	err := s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		user, err := q.LockAccount(ctx, u.ID)
		if err != nil {
			return auditEvent{}, err
		}
		if !user.EmailVerifiedAt.Valid {
			return auditEvent{}, errAccessDenied
		}
		err = q.SetMaintenanceEmailPreference(ctx, sqlc.SetMaintenanceEmailPreferenceParams{ID: u.ID, MaintenanceEmailsEnabled: *in.Enabled})
		return auditEvent{actor: u.ID, entity: "user", id: u.ID, action: "user.email_preferences_updated"}, err
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
