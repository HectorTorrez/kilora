// Package httpserver expone el router HTTP del API.
package httpserver

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Deps struct {
	Logger    *slog.Logger
	DB        *pgxpool.Pool
	WebOrigin string
}

func NewRouter(d Deps) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(requestLogger(d.Logger))
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(cors(d.WebOrigin))

	r.Get("/healthz", health(d.DB))

	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/", func(w http.ResponseWriter, _ *http.Request) {
			writeJSON(w, http.StatusOK, map[string]string{"service": "kilora", "version": "v1"})
		})
	})

	return r
}
