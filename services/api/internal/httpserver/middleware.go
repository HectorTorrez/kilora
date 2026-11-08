package httpserver

import (
	"context"
	"encoding/json"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"kilora/api/internal/auth"
)

type contextKey int

const (
	userKey contextKey = iota
	workshopKey
)

type sessionUser struct {
	ID                           uuid.UUID
	Email, FullName, SessionHash string
	VerifiedAt                   *time.Time
}
type WorkshopContext struct {
	UserID, WorkshopID uuid.UUID
	Role               string
	BranchIDs          []uuid.UUID
}

func CurrentWorkshop(ctx context.Context) (WorkshopContext, bool) {
	v, ok := ctx.Value(workshopKey).(WorkshopContext)
	return v, ok
}
func currentUser(ctx context.Context) *sessionUser {
	v, _ := ctx.Value(userKey).(*sessionUser)
	return v
}
func fail(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		fail(w, 400, "JSON inválido")
		return false
	}
	if err := d.Decode(&struct{}{}); err != io.EOF {
		fail(w, 400, "JSON inválido")
		return false
	}
	return true
}
func security(origin string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
			if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodOptions {
				o := r.Header.Get("Origin")
				if o == "" && r.Header.Get("Referer") != "" {
					u, err := url.Parse(r.Header.Get("Referer"))
					if err != nil || u.Scheme == "" || u.Host == "" {
						fail(w, 403, "Origen no permitido")
						return
					}
					o = u.Scheme + "://" + u.Host
				}
				if o != "" && o != origin {
					fail(w, 403, "Origen no permitido")
					return
				}
				if r.ContentLength != 0 || len(r.TransferEncoding) > 0 {
					t, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
					if err != nil || t != "application/json" {
						fail(w, 415, "Se requiere application/json")
						return
					}
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}
func (s *server) loadSession(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie("kilora_session")
		if err == nil && c.Value != "" {
			hash := auth.HashToken(c.Value)
			u := &sessionUser{SessionHash: hash}
			var seen time.Time
			err = s.db.QueryRow(r.Context(), `SELECT u.id,u.email,u.full_name,u.email_verified_at,s.last_seen_at FROM session s JOIN app_user u ON u.id=s.user_id WHERE s.id=$1 AND s.expires_at>now()`, hash).Scan(&u.ID, &u.Email, &u.FullName, &u.VerifiedAt, &seen)
			if err == nil {
				if time.Since(seen) >= time.Hour {
					tag, e := s.db.Exec(r.Context(), `UPDATE session SET last_seen_at=now(),expires_at=now()+interval '30 days' WHERE id=$1 AND expires_at>now() AND last_seen_at<=now()-interval '1 hour'`, hash)
					if e == nil && tag.RowsAffected() > 0 {
						s.setCookie(w, c.Value)
					}
				}
				r = r.WithContext(context.WithValue(r.Context(), userKey, u))
			}
		}
		next.ServeHTTP(w, r)
	})
}
func requireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if currentUser(r.Context()) == nil {
			fail(w, 401, "Debes iniciar sesión")
			return
		}
		next.ServeHTTP(w, r)
	})
}
func (s *server) requireWorkshop(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(chi.URLParam(r, "workshopID"))
		if err != nil {
			fail(w, 403, "Acceso denegado")
			return
		}
		u := currentUser(r.Context())
		wc := WorkshopContext{UserID: u.ID, WorkshopID: id, BranchIDs: []uuid.UUID{}}
		rows, err := s.db.Query(r.Context(), `SELECT branch_id,role FROM membership WHERE user_id=$1 AND workshop_id=$2`, u.ID, id)
		if err != nil {
			fail(w, 500, "Error interno")
			return
		}
		defer rows.Close()
		rank := map[string]int{"mecanico": 1, "recepcion": 2, "admin": 3}
		for rows.Next() {
			var b uuid.UUID
			var role string
			if rows.Scan(&b, &role) != nil {
				fail(w, 500, "Error interno")
				return
			}
			wc.BranchIDs = append(wc.BranchIDs, b)
			if rank[role] > rank[wc.Role] {
				wc.Role = role
			}
		}
		if rows.Err() != nil {
			fail(w, 500, "Error interno")
			return
		}
		if len(wc.BranchIDs) == 0 {
			fail(w, 403, "Acceso denegado")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), workshopKey, wc)))
	})
}
func clientIP(r *http.Request) string {
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

type limiter struct {
	mu       sync.Mutex
	attempts map[string][]time.Time
}

func (l *limiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	for k, ts := range l.attempts {
		if len(ts) == 0 || now.Sub(ts[len(ts)-1]) >= 15*time.Minute {
			delete(l.attempts, k)
		}
	}
	ts := l.attempts[key]
	i := 0
	for i < len(ts) && now.Sub(ts[i]) >= 15*time.Minute {
		i++
	}
	ts = ts[i:]
	if len(ts) >= 10 {
		l.attempts[key] = ts
		return false
	}
	l.attempts[key] = append(ts, now)
	return true
}
func normalizedEmail(s string) string { return strings.ToLower(strings.TrimSpace(s)) }
