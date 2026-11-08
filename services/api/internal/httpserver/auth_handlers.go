package httpserver

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"kilora/api/internal/auth"
	"kilora/api/internal/database"
	"kilora/api/internal/database/sqlc"
	"net/http"
	"net/mail"
	"strings"
	"time"
)

type userResponse struct {
	ID              uuid.UUID  `json:"id"`
	Email           string     `json:"email"`
	FullName        string     `json:"full_name"`
	EmailVerifiedAt *time.Time `json:"email_verified_at"`
}

func validEmail(e string) bool { a, err := mail.ParseAddress(e); return err == nil && a.Address == e }
func (s *server) setCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{Name: "kilora_session", Value: token, Path: "/", HttpOnly: true, Secure: s.secure, SameSite: http.SameSiteLaxMode, MaxAge: 30 * 24 * 3600, Expires: time.Now().Add(30 * 24 * time.Hour)})
}
func (s *server) clearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: "kilora_session", Path: "/", HttpOnly: true, Secure: s.secure, SameSite: http.SameSiteLaxMode, MaxAge: -1})
}
func createSession(ctx context.Context, q *sqlc.Queries, user uuid.UUID, r *http.Request) (string, error) {
	token, err := auth.NewToken()
	if err != nil {
		return "", err
	}
	agent, ip := r.UserAgent(), clientIP(r)
	err = q.CreateSession(ctx, sqlc.CreateSessionParams{ID: auth.HashToken(token), UserID: dbUUID(user), ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(30 * 24 * time.Hour), Valid: true}, UserAgent: &agent, Ip: &ip})
	return token, err
}
func createToken(ctx context.Context, q *sqlc.Queries, user uuid.UUID, purpose string, ttl time.Duration) (string, error) {
	token, err := auth.NewToken()
	if err != nil {
		return "", err
	}
	err = q.CreateAuthToken(ctx, sqlc.CreateAuthTokenParams{TokenHash: auth.HashToken(token), UserID: dbUUID(user), Purpose: sqlc.AuthTokenPurpose(purpose), ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(ttl), Valid: true}})
	return token, err
}
func (s *server) register(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email, Password string
		FullName        string `json:"full_name"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Email = normalizedEmail(in.Email)
	in.FullName = strings.TrimSpace(in.FullName)
	if !validEmail(in.Email) || in.FullName == "" {
		fail(w, 400, "Correo o nombre inválido")
		return
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	var u userResponse
	var verify, token string
	err = database.WithTx(r.Context(), s.db, func(q *sqlc.Queries) error {
		created, e := q.CreateUser(r.Context(), sqlc.CreateUserParams{Email: in.Email, PasswordHash: hash, FullName: in.FullName})
		if e != nil {
			return e
		}
		u = userResponse{ID: uuid.UUID(created.ID.Bytes), Email: created.Email, FullName: created.FullName}
		verify, e = createToken(r.Context(), q, u.ID, "verify_email", 24*time.Hour)
		if e != nil {
			return e
		}
		token, e = createSession(r.Context(), q, u.ID, r)
		if e != nil {
			return e
		}
		_, e = q.InsertAuditEvent(r.Context(), sqlc.InsertAuditEventParams{ActorUserID: dbUUID(u.ID), EntityID: dbUUID(u.ID), Entity: "user", Action: "user.register"})
		return e
	})
	if err != nil {
		var pe *pgconn.PgError
		if errors.As(err, &pe) && pe.Code == "23505" {
			fail(w, 409, "El correo ya está registrado")
		} else {
			fail(w, 500, "Error interno")
		}
		return
	}
	if err = s.mailer.Send(r.Context(), u.Email, "Verifica tu correo", s.origin+"/verificar?token="+verify); err != nil {
		s.logger.Error("error enviando correo", "error", err)
	}
	s.setCookie(w, token)
	writeJSON(w, 201, map[string]any{"user": u})
}
func (s *server) login(w http.ResponseWriter, r *http.Request) {
	var in struct{ Email, Password string }
	if !decode(w, r, &in) {
		return
	}
	in.Email = normalizedEmail(in.Email)
	if !s.limiter.allow(clientIP(r) + "|" + in.Email) {
		fail(w, 429, "Demasiados intentos. Intenta más tarde")
		return
	}
	var id uuid.UUID
	var hash string
	user, err := sqlc.New(s.db).GetUserByEmail(r.Context(), in.Email)
	id = uuid.UUID(user.ID.Bytes)
	hash = user.PasswordHash
	if err != nil || !auth.VerifyPassword(in.Password, hash) {
		fail(w, 401, "Correo o contraseña incorrectos")
		return
	}
	var token string
	err = database.WithTx(r.Context(), s.db, func(q *sqlc.Queries) error { var e error; token, e = createSession(r.Context(), q, id, r); return e })
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	s.setCookie(w, token)
	w.WriteHeader(204)
}
func (s *server) logout(w http.ResponseWriter, r *http.Request) {
	if u := currentUser(r.Context()); u != nil {
		if err := sqlc.New(s.db).DeleteSession(r.Context(), u.SessionHash); err != nil {
			fail(w, 500, "Error interno")
			return
		}
	}
	s.clearCookie(w)
	w.WriteHeader(204)
}
func (s *server) me(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r.Context())
	rows, err := sqlc.New(s.db).ListMembershipsByUser(r.Context(), dbUUID(u.ID))
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	memberships := []map[string]any{}
	for _, row := range rows {
		memberships = append(memberships, map[string]any{"workshop_id": uuid.UUID(row.WorkshopID.Bytes), "workshop_name": row.WorkshopName, "branch_id": uuid.UUID(row.BranchID.Bytes), "branch_name": row.BranchName, "role": row.Role})
	}
	writeJSON(w, 200, map[string]any{"user": userResponse{u.ID, u.Email, u.FullName, u.VerifiedAt}, "memberships": memberships})
}
func (s *server) verify(w http.ResponseWriter, r *http.Request) {
	var in struct{ Token string }
	if !decode(w, r, &in) {
		return
	}
	err := database.WithTx(r.Context(), s.db, func(q *sqlc.Queries) error {
		id, e := q.ConsumeAuthToken(r.Context(), sqlc.ConsumeAuthTokenParams{TokenHash: auth.HashToken(in.Token), Purpose: sqlc.AuthTokenPurposeVerifyEmail})
		if e != nil {
			return e
		}
		_, e = q.MarkUserEmailVerified(r.Context(), id)
		return e
	})
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 400, "Token inválido o vencido")
		return
	}
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	w.WriteHeader(204)
}
func (s *server) forgot(w http.ResponseWriter, r *http.Request) {
	var in struct{ Email string }
	if !decode(w, r, &in) {
		return
	}
	email := normalizedEmail(in.Email)
	if user, err := sqlc.New(s.db).GetUserByEmail(r.Context(), email); err == nil {
		var token string
		e := database.WithTx(r.Context(), s.db, func(q *sqlc.Queries) error {
			var e error
			token, e = createToken(r.Context(), q, uuid.UUID(user.ID.Bytes), "reset_password", time.Hour)
			return e
		})
		if e == nil {
			e = s.mailer.Send(r.Context(), email, "Restablece tu contraseña", s.origin+"/restablecer?token="+token)
		}
		if e != nil {
			s.logger.Error("error enviando recuperación", "error", e)
		}
	}
	w.WriteHeader(204)
}
func (s *server) reset(w http.ResponseWriter, r *http.Request) {
	var in struct{ Token, Password string }
	if !decode(w, r, &in) {
		return
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	err = database.WithTx(r.Context(), s.db, func(q *sqlc.Queries) error {
		id, e := q.ConsumeAuthToken(r.Context(), sqlc.ConsumeAuthTokenParams{TokenHash: auth.HashToken(in.Token), Purpose: sqlc.AuthTokenPurposeResetPassword})
		if e != nil {
			return e
		}
		_, e = q.UpdateUserPassword(r.Context(), sqlc.UpdateUserPasswordParams{ID: id, PasswordHash: hash})
		if e != nil {
			return e
		}
		if e = q.DeleteUserSessions(r.Context(), id); e != nil {
			return e
		}
		_, e = q.InsertAuditEvent(r.Context(), sqlc.InsertAuditEventParams{ActorUserID: id, EntityID: id, Entity: "user", Action: "user.password_reset"})
		return e
	})
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 400, "Token inválido o vencido")
		return
	}
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	s.clearCookie(w)
	w.WriteHeader(204)
}
