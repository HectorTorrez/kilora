package httpserver

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"kilora/api/internal/auth"
	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/values"
)

const (
	verifyEmailTTL   = 24 * time.Hour
	resetPasswordTTL = time.Hour
	invalidToken     = "Token inválido o vencido"
)

type userResponse struct {
	ID              uuid.UUID  `json:"id"`
	Email           string     `json:"email"`
	FullName        string     `json:"full_name"`
	EmailVerifiedAt *time.Time `json:"email_verified_at"`
}

func (s *server) setCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{Name: auth.SessionCookie, Value: token, Path: "/", HttpOnly: true, Secure: s.secure, SameSite: http.SameSiteLaxMode, MaxAge: int(auth.SessionTTL.Seconds()), Expires: time.Now().Add(auth.SessionTTL)})
}

func (s *server) clearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: auth.SessionCookie, Path: "/", HttpOnly: true, Secure: s.secure, SameSite: http.SameSiteLaxMode, MaxAge: -1})
}

func createSession(ctx context.Context, q *sqlc.Queries, user uuid.UUID, r *http.Request) (string, error) {
	token, hash, err := auth.NewTokenPair()
	if err != nil {
		return "", err
	}
	agent, ip := r.UserAgent(), clientIP(r)
	err = q.CreateSession(ctx, sqlc.CreateSessionParams{ID: hash, UserID: user, ExpiresAt: timestamptz(time.Now().Add(auth.SessionTTL)), UserAgent: &agent, Ip: &ip})
	return token, err
}

func (s *server) startSession(w http.ResponseWriter, r *http.Request, user uuid.UUID) error {
	var token string
	err := s.tx(r.Context(), func(q *sqlc.Queries) error {
		var err error
		token, err = createSession(r.Context(), q, user, r)
		return err
	})
	if err != nil {
		return err
	}
	s.setCookie(w, token)
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func createToken(ctx context.Context, q *sqlc.Queries, user uuid.UUID, purpose sqlc.AuthTokenPurpose, ttl time.Duration) (string, error) {
	token, hash, err := auth.NewTokenPair()
	if err != nil {
		return "", err
	}
	err = q.CreateAuthToken(ctx, sqlc.CreateAuthTokenParams{TokenHash: hash, UserID: user, Purpose: purpose, ExpiresAt: timestamptz(time.Now().Add(ttl))})
	return token, err
}

func (s *server) register(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		FullName string `json:"full_name"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	email, validEmail := values.Email(in.Email)
	in.FullName = strings.TrimSpace(in.FullName)
	if !validEmail || !values.PersonName(in.FullName) {
		return badRequest("Correo o nombre inválido")
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		return badRequest(err.Error())
	}
	ctx := r.Context()
	var u userResponse
	var verify, token string
	err = s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		created, err := q.CreateUser(ctx, sqlc.CreateUserParams{Email: email, PasswordHash: hash, FullName: in.FullName})
		if err != nil {
			return auditEvent{}, err
		}
		u = userResponse{ID: created.ID, Email: created.Email, FullName: created.FullName}
		if verify, err = createToken(ctx, q, u.ID, sqlc.AuthTokenPurposeVerifyEmail, verifyEmailTTL); err != nil {
			return auditEvent{}, err
		}
		if token, err = createSession(ctx, q, u.ID, r); err != nil {
			return auditEvent{}, err
		}
		return auditEvent{actor: u.ID, entity: "user", id: u.ID, action: "user.register"}, nil
	})
	if isUniqueViolation(err) {
		return conflict("El correo ya está registrado")
	}
	if err != nil {
		return err
	}
	if err = s.mailer.Send(ctx, u.Email, "Verifica tu correo", s.webURL("/verificar?token="+verify)); err != nil {
		s.logger.Error("error enviando correo", "error", err)
	}
	s.setCookie(w, token)
	writeJSON(w, http.StatusCreated, map[string]any{"user": u})
	return nil
}

func (s *server) login(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	email := values.NormalizeEmail(in.Email)
	if !s.limiter.allow(clientIP(r)+"|"+email, loginAttemptLimit) {
		return httpError{http.StatusTooManyRequests, "Demasiados intentos. Intenta más tarde"}
	}
	invalid := httpError{http.StatusUnauthorized, "Correo o contraseña incorrectos"}
	user, err := sqlc.New(s.db).GetUserByEmail(r.Context(), email)
	if errors.Is(err, pgx.ErrNoRows) {
		return invalid
	}
	if err != nil {
		return err
	}
	if !auth.VerifyPassword(in.Password, user.PasswordHash) {
		return invalid
	}
	return s.startSession(w, r, user.ID)
}

func (s *server) logout(w http.ResponseWriter, r *http.Request) error {
	if u := currentUser(r.Context()); u != nil {
		if err := sqlc.New(s.db).DeleteSession(r.Context(), u.SessionHash); err != nil {
			return err
		}
	}
	s.clearCookie(w)
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *server) me(w http.ResponseWriter, r *http.Request) error {
	u := currentUser(r.Context())
	rows, err := sqlc.New(s.db).ListMembershipsByUser(r.Context(), u.ID)
	if err != nil {
		return err
	}
	memberships := []map[string]any{}
	for _, row := range rows {
		memberships = append(memberships, map[string]any{"workshop_id": row.WorkshopID, "workshop_name": row.WorkshopName, "branch_id": row.BranchID, "branch_name": row.BranchName, "role": row.Role})
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": userResponse{u.ID, u.Email, u.FullName, u.VerifiedAt}, "memberships": memberships})
	return nil
}

func (s *server) verify(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Token string `json:"token"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	ctx := r.Context()
	err := s.tx(ctx, func(q *sqlc.Queries) error {
		id, err := q.ConsumeAuthToken(ctx, sqlc.ConsumeAuthTokenParams{TokenHash: auth.HashToken(in.Token), Purpose: sqlc.AuthTokenPurposeVerifyEmail})
		if err != nil {
			return err
		}
		_, err = q.MarkUserEmailVerified(ctx, id)
		return err
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return badRequest(invalidToken)
	}
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *server) forgot(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Email string `json:"email"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	email := values.NormalizeEmail(in.Email)
	if auth.IsDemoEmail(email) {
		return nil
	}
	ctx := r.Context()
	user, err := sqlc.New(s.db).GetUserByEmail(ctx, email)
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			s.logger.Error("error buscando usuario", "error", err)
		}
		return nil
	}
	var token string
	err = s.tx(ctx, func(q *sqlc.Queries) error {
		var err error
		token, err = createToken(ctx, q, user.ID, sqlc.AuthTokenPurposeResetPassword, resetPasswordTTL)
		return err
	})
	if err == nil {
		err = s.mailer.Send(ctx, email, "Restablece tu contraseña", s.webURL("/restablecer?token="+token))
	}
	if err != nil {
		s.logger.Error("error enviando recuperación", "error", err)
	}
	return nil
}

func (s *server) reset(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		return badRequest(err.Error())
	}
	ctx := r.Context()
	err = s.mutate(ctx, func(q *sqlc.Queries) (auditEvent, error) {
		id, err := q.ConsumeAuthToken(ctx, sqlc.ConsumeAuthTokenParams{TokenHash: auth.HashToken(in.Token), Purpose: sqlc.AuthTokenPurposeResetPassword})
		if err != nil {
			return auditEvent{}, err
		}
		user, err := q.GetUserByID(ctx, id)
		if err != nil {
			return auditEvent{}, err
		}
		if auth.IsDemoEmail(user.Email) {
			return auditEvent{}, forbidden("Las cuentas demo no pueden cambiar su contraseña")
		}
		if _, err = q.UpdateUserPassword(ctx, sqlc.UpdateUserPasswordParams{ID: id, PasswordHash: hash}); err != nil {
			return auditEvent{}, err
		}
		if err = q.DeleteUserSessions(ctx, id); err != nil {
			return auditEvent{}, err
		}
		return auditEvent{actor: id, entity: "user", id: id, action: "user.password_reset"}, nil
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return badRequest(invalidToken)
	}
	if err != nil {
		return err
	}
	s.clearCookie(w)
	w.WriteHeader(http.StatusNoContent)
	return nil
}
