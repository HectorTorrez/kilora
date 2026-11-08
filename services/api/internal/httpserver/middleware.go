package httpserver

import (
	"context"
	"log/slog"
	"mime"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"kilora/api/internal/auth"
	"kilora/api/internal/database/sqlc"
)

const (
	loginAttemptLimit = 10
	publicReadLimit   = 60
	limiterWindow     = 15 * time.Minute
)

func health(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := db.Ping(ctx); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "degraded", "db": "down"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "db": "up"})
	}
}

func requestLogger(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)
			logger.Info("request",
				"method", r.Method,
				"path", r.URL.Path,
				"status", ww.Status(),
				"bytes", ww.BytesWritten(),
				"duration_ms", time.Since(start).Milliseconds(),
				"request_id", middleware.GetReqID(r.Context()),
			)
		})
	}
}

func cors(origin string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if o := r.Header.Get("Origin"); o == origin {
				w.Header().Set("Access-Control-Allow-Origin", o)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
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
						fail(w, http.StatusForbidden, "Origen no permitido")
						return
					}
					o = u.Scheme + "://" + u.Host
				}
				if o != "" && o != origin {
					fail(w, http.StatusForbidden, "Origen no permitido")
					return
				}
				if r.ContentLength != 0 || len(r.TransferEncoding) > 0 {
					t, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
					if err != nil || t != "application/json" {
						fail(w, http.StatusUnsupportedMediaType, "Se requiere application/json")
						return
					}
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

type sessionUser struct {
	ID                           uuid.UUID
	Email, FullName, SessionHash string
	VerifiedAt                   *time.Time
}

func currentUser(ctx context.Context) *sessionUser {
	v, _ := ctx.Value(userKey).(*sessionUser)
	return v
}

func (s *server) loadSession(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if c, err := r.Cookie(auth.SessionCookie); err == nil && c.Value != "" {
			if u := s.sessionUser(w, r, c.Value); u != nil {
				r = r.WithContext(context.WithValue(r.Context(), userKey, u))
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (s *server) sessionUser(w http.ResponseWriter, r *http.Request, token string) *sessionUser {
	hash := auth.HashToken(token)
	q := sqlc.New(s.db)
	session, err := q.GetSession(r.Context(), hash)
	if err != nil {
		return nil
	}
	user, err := q.GetUserByID(r.Context(), session.UserID)
	if err != nil {
		return nil
	}
	if time.Since(session.LastSeenAt.Time) >= auth.SessionTouchInterval {
		if n, err := q.TouchSession(r.Context(), hash); err == nil && n > 0 {
			s.setCookie(w, token)
		}
	}
	return &sessionUser{ID: user.ID, Email: user.Email, FullName: user.FullName, SessionHash: hash, VerifiedAt: nullableTime(user.EmailVerifiedAt)}
}

func requireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if currentUser(r.Context()) == nil {
			fail(w, http.StatusUnauthorized, "Debes iniciar sesión")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *server) requireWorkshop(next http.Handler) http.Handler {
	return s.handle(func(w http.ResponseWriter, r *http.Request) error {
		id, err := uuid.Parse(chi.URLParam(r, "workshopID"))
		if err != nil {
			return errAccessDenied
		}
		u := currentUser(r.Context())
		rows, err := sqlc.New(s.db).ListMembershipsByUser(r.Context(), u.ID)
		if err != nil {
			return err
		}
		wc := workshopAccess{userID: u.ID, workshopID: id, branchIDs: []uuid.UUID{}}
		rank := map[sqlc.MembershipRole]int{sqlc.MembershipRoleMecanico: 1, sqlc.MembershipRoleRecepcion: 2, sqlc.MembershipRoleAdmin: 3}
		for _, row := range rows {
			if row.WorkshopID != id {
				continue
			}
			wc.branchIDs = append(wc.branchIDs, row.BranchID)
			if canWrite(row.Role) {
				wc.writeBranchIDs = append(wc.writeBranchIDs, row.BranchID)
			}
			if row.Role == sqlc.MembershipRoleAdmin {
				wc.adminBranchIDs = append(wc.adminBranchIDs, row.BranchID)
			}
			if rank[row.Role] > rank[wc.role] {
				wc.role = row.Role
			}
		}
		if len(wc.branchIDs) == 0 {
			return errAccessDenied
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), workshopKey, wc)))
		return nil
	})
}

func clientIP(r *http.Request) string {
	if ip, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return ip
	}
	return r.RemoteAddr
}

type limiter struct {
	mu       sync.Mutex
	attempts map[string][]time.Time
}

func (l *limiter) allow(key string, limit int) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	for k, ts := range l.attempts {
		if len(ts) == 0 || now.Sub(ts[len(ts)-1]) >= limiterWindow {
			delete(l.attempts, k)
		}
	}
	ts := l.attempts[key]
	i := 0
	for i < len(ts) && now.Sub(ts[i]) >= limiterWindow {
		i++
	}
	ts = ts[i:]
	if len(ts) >= limit {
		l.attempts[key] = ts
		return false
	}
	l.attempts[key] = append(ts, now)
	return true
}

func normalizedEmail(s string) string { return strings.ToLower(strings.TrimSpace(s)) }

var errTooManyRequests = httpError{http.StatusTooManyRequests, "Demasiadas solicitudes"}

func (s *server) limitPublicRead(r *http.Request, scope string) error {
	if !s.limiter.allow(scope+":"+clientIP(r), publicReadLimit) {
		return errTooManyRequests
	}
	return nil
}
