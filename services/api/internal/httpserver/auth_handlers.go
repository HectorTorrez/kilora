package httpserver

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"kilora/api/internal/auth"
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
func createSession(ctx context.Context, tx pgx.Tx, user uuid.UUID, r *http.Request) (string, error) {
	token, err := auth.NewToken()
	if err != nil {
		return "", err
	}
	_, err = tx.Exec(ctx, `INSERT INTO session(id,user_id,expires_at,user_agent,ip) VALUES($1,$2,now()+interval '30 days',$3,$4)`, auth.HashToken(token), user, r.UserAgent(), clientIP(r))
	return token, err
}
func createToken(ctx context.Context, tx pgx.Tx, user uuid.UUID, purpose string, ttl time.Duration) (string, error) {
	token, err := auth.NewToken()
	if err != nil {
		return "", err
	}
	_, err = tx.Exec(ctx, `INSERT INTO auth_token(token_hash,user_id,purpose,expires_at) VALUES($1,$2,$3,$4)`, auth.HashToken(token), user, purpose, time.Now().Add(ttl))
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
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	defer tx.Rollback(r.Context())
	var u userResponse
	err = tx.QueryRow(r.Context(), `INSERT INTO app_user(email,password_hash,full_name) VALUES($1,$2,$3) RETURNING id,email,full_name,email_verified_at`, in.Email, hash, in.FullName).Scan(&u.ID, &u.Email, &u.FullName, &u.EmailVerifiedAt)
	if err != nil {
		var pe *pgconn.PgError
		if errors.As(err, &pe) && pe.Code == "23505" {
			fail(w, 409, "El correo ya está registrado")
		} else {
			fail(w, 500, "Error interno")
		}
		return
	}
	verify, err := createToken(r.Context(), tx, u.ID, "verify_email", 24*time.Hour)
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	token, err := createSession(r.Context(), tx, u.ID, r)
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	_, err = sqlc.New(tx).InsertAuditEvent(r.Context(), sqlc.InsertAuditEventParams{ActorUserID: pgtype.UUID{Bytes: u.ID, Valid: true}, EntityID: pgtype.UUID{Bytes: u.ID, Valid: true}, Entity: "user", Action: "user.register"})
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		fail(w, 500, "Error interno")
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
	err := s.db.QueryRow(r.Context(), `SELECT id,password_hash FROM app_user WHERE email=$1`, in.Email).Scan(&id, &hash)
	if err != nil || !auth.VerifyPassword(in.Password, hash) {
		fail(w, 401, "Correo o contraseña incorrectos")
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	defer tx.Rollback(r.Context())
	token, err := createSession(r.Context(), tx, id, r)
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	if tx.Commit(r.Context()) != nil {
		fail(w, 500, "Error interno")
		return
	}
	s.setCookie(w, token)
	w.WriteHeader(204)
}
func (s *server) logout(w http.ResponseWriter, r *http.Request) {
	if u := currentUser(r.Context()); u != nil {
		if _, err := s.db.Exec(r.Context(), `DELETE FROM session WHERE id=$1`, u.SessionHash); err != nil {
			fail(w, 500, "Error interno")
			return
		}
	}
	s.clearCookie(w)
	w.WriteHeader(204)
}
func (s *server) me(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r.Context())
	rows, err := s.db.Query(r.Context(), `SELECT m.workshop_id,w.name,m.branch_id,b.name,m.role FROM membership m JOIN workshop w ON w.id=m.workshop_id JOIN branch b ON b.id=m.branch_id AND b.workshop_id=m.workshop_id WHERE m.user_id=$1 ORDER BY w.name,b.name`, u.ID)
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	defer rows.Close()
	memberships := []map[string]any{}
	for rows.Next() {
		var wid, bid uuid.UUID
		var wn, bn, role string
		if rows.Scan(&wid, &wn, &bid, &bn, &role) != nil {
			fail(w, 500, "Error interno")
			return
		}
		memberships = append(memberships, map[string]any{"workshop_id": wid, "workshop_name": wn, "branch_id": bid, "branch_name": bn, "role": role})
	}
	if rows.Err() != nil {
		fail(w, 500, "Error interno")
		return
	}
	writeJSON(w, 200, map[string]any{"user": userResponse{u.ID, u.Email, u.FullName, u.VerifiedAt}, "memberships": memberships})
}
func (s *server) verify(w http.ResponseWriter, r *http.Request) {
	var in struct{ Token string }
	if !decode(w, r, &in) {
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	defer tx.Rollback(r.Context())
	var id uuid.UUID
	err = tx.QueryRow(r.Context(), `UPDATE auth_token SET used_at=now() WHERE token_hash=$1 AND purpose='verify_email' AND used_at IS NULL AND expires_at>now() RETURNING user_id`, auth.HashToken(in.Token)).Scan(&id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			fail(w, 400, "Token inválido o vencido")
		} else {
			fail(w, 500, "Error interno")
		}
		return
	}
	_, err = tx.Exec(r.Context(), `UPDATE app_user SET email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1`, id)
	if err != nil || tx.Commit(r.Context()) != nil {
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
	var id uuid.UUID
	if err := s.db.QueryRow(r.Context(), `SELECT id FROM app_user WHERE email=$1`, email).Scan(&id); err == nil {
		tx, e := s.db.Begin(r.Context())
		if e == nil {
			defer tx.Rollback(r.Context())
			token, e := createToken(r.Context(), tx, id, "reset_password", time.Hour)
			if e == nil {
				e = tx.Commit(r.Context())
				if e == nil {
					e = s.mailer.Send(r.Context(), email, "Restablece tu contraseña", s.origin+"/restablecer?token="+token)
				}
			}
			if e != nil {
				s.logger.Error("error enviando recuperación", "error", e)
			}
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
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	defer tx.Rollback(r.Context())
	var id uuid.UUID
	err = tx.QueryRow(r.Context(), `UPDATE auth_token SET used_at=now() WHERE token_hash=$1 AND purpose='reset_password' AND used_at IS NULL AND expires_at>now() RETURNING user_id`, auth.HashToken(in.Token)).Scan(&id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			fail(w, 400, "Token inválido o vencido")
		} else {
			fail(w, 500, "Error interno")
		}
		return
	}
	_, err = tx.Exec(r.Context(), `UPDATE app_user SET password_hash=$2 WHERE id=$1`, id, hash)
	if err == nil {
		_, err = tx.Exec(r.Context(), `DELETE FROM session WHERE user_id=$1`, id)
	}
	if err == nil {
		_, err = sqlc.New(tx).InsertAuditEvent(r.Context(), sqlc.InsertAuditEventParams{ActorUserID: pgtype.UUID{Bytes: id, Valid: true}, EntityID: pgtype.UUID{Bytes: id, Valid: true}, Entity: "user", Action: "user.password_reset"})
	}
	if err != nil || tx.Commit(r.Context()) != nil {
		fail(w, 500, "Error interno")
		return
	}
	s.clearCookie(w)
	w.WriteHeader(204)
}
