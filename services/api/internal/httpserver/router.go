// Package httpserver expone el router HTTP del API.
package httpserver

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"kilora/api/internal/auth"
)

type Deps struct {
	Logger        *slog.Logger
	DB            *pgxpool.Pool
	WebOrigin     string
	Mailer        auth.Mailer
	SecureCookies bool
}

type server struct {
	db      *pgxpool.Pool
	logger  *slog.Logger
	origin  string
	secure  bool
	mailer  auth.Mailer
	limiter limiter
}

func NewRouter(d Deps) http.Handler {
	if d.Logger == nil {
		d.Logger = slog.Default()
	}
	if d.Mailer == nil {
		d.Mailer = auth.LogMailer{Logger: d.Logger}
	}
	s := &server{db: d.DB, logger: d.Logger, origin: d.WebOrigin, secure: d.SecureCookies, mailer: d.Mailer, limiter: limiter{attempts: make(map[string][]time.Time)}}
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(requestLogger(d.Logger))
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(cors(d.WebOrigin))
	r.Use(security(d.WebOrigin))
	r.Use(s.loadSession)

	r.Get("/healthz", health(d.DB))

	r.Route("/api/v1", func(r chi.Router) {
		r.Post("/auth/register", s.register)
		r.Post("/auth/login", s.login)
		r.Post("/auth/logout", s.logout)
		r.Post("/auth/verify-email", s.verify)
		r.Post("/auth/forgot-password", s.forgot)
		r.Post("/auth/reset-password", s.reset)
		r.Group(func(r chi.Router) {
			r.Use(requireUser)
			r.Get("/auth/me", s.me)
			r.Post("/workshops", s.createWorkshop)
			r.Get("/me/vehicles/{vehicleID}/history", s.history)
			r.Route("/workshops/{workshopID}", func(r chi.Router) {
				r.Use(s.requireWorkshop)
				r.Get("/", s.getWorkshop)
				r.Get("/vehicles/{vehicleID}/history", s.history)
			})
		})
		r.Get("/", func(w http.ResponseWriter, _ *http.Request) {
			writeJSON(w, http.StatusOK, map[string]string{"service": "kilora", "version": "v1"})
		})
	})

	return r
}
