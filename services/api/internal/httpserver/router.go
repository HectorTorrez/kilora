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
	DemoMode      bool
}

type server struct {
	db       *pgxpool.Pool
	logger   *slog.Logger
	origin   string
	secure   bool
	mailer   auth.Mailer
	limiter  limiter
	demoMode bool
}

func NewRouter(d Deps) http.Handler {
	if d.Logger == nil {
		d.Logger = slog.Default()
	}
	if d.Mailer == nil {
		d.Mailer = auth.LogMailer{Logger: d.Logger}
	}
	s := &server{db: d.DB, logger: d.Logger, origin: d.WebOrigin, secure: d.SecureCookies, mailer: d.Mailer, demoMode: d.DemoMode, limiter: limiter{attempts: make(map[string][]time.Time)}}
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
		r.Get("/public/demo", s.publicDemo)
		r.Post("/auth/demo", s.demoLogin)
		r.Get("/public/quotes/{token}", s.publicQuote)
		r.Get("/public/invitations/{token}", s.publicInvitation)
		r.Post("/auth/register", s.register)
		r.Post("/auth/login", s.login)
		r.Post("/auth/logout", s.logout)
		r.Post("/auth/verify-email", s.verify)
		r.Post("/auth/forgot-password", s.forgot)
		r.Post("/auth/reset-password", s.reset)
		r.Group(func(r chi.Router) {
			r.Use(requireUser)
			r.Get("/auth/me", s.me)
			r.Post("/invitations/{token}/accept", s.acceptInvitation)
			r.Post("/workshops", s.createWorkshop)
			r.Get("/me/vehicles", s.listOwnerVehicles)
			r.Post("/me/vehicles", s.createOwnerVehicle)
			r.Get("/me/vehicles/{vehicleID}", s.getOwnerVehicle)
			r.Post("/me/vehicles/{vehicleID}/history", s.manualHistory)
			r.Post("/me/vehicles/{vehicleID}/corrections", s.ownerCorrection)
			r.Post("/me/vehicles/{vehicleID}/odometer", s.addOdometer)
			r.Get("/me/vehicles/{vehicleID}/history", s.history)
			r.Route("/workshops/{workshopID}", func(r chi.Router) {
				r.Use(s.requireWorkshop)
				r.Get("/", s.getWorkshop)
				r.Post("/work-orders", s.createOrder)
				r.Get("/work-orders", s.listOrders)
				r.Get("/work-orders/{orderID}", s.getOrder)
				r.With(s.jobTransaction).Patch("/work-orders/{orderID}", s.editOrder)
				r.Patch("/work-orders/{orderID}/status", s.changeStatus)
				r.Put("/work-orders/{orderID}/quote", s.saveQuote)
				r.Get("/work-orders/{orderID}/quote", s.getQuote)
				r.Post("/work-orders/{orderID}/quote/share", s.shareQuote)
				r.Patch("/work-orders/{orderID}/quote/outcome", s.quoteOutcome)
				r.With(s.jobTransaction).Post("/work-orders/{orderID}/jobs", s.createJob)
				r.With(s.jobTransaction).Delete("/work-orders/{orderID}/jobs/{jobID}", s.deleteJob)
				r.With(s.jobTransaction).Post("/work-orders/{orderID}/jobs/{jobID}/parts", s.createPart)
				r.With(s.jobTransaction).Delete("/work-orders/{orderID}/jobs/{jobID}/parts/{partID}", s.deletePart)
				r.Get("/vehicles", s.listVehicles)
				r.Post("/vehicles", s.createVehicle)
				r.Get("/vehicles/{vehicleID}", s.getVehicle)
				r.Post("/vehicles/{vehicleID}/invitations", s.createInvitation)
				r.Get("/vehicles/{vehicleID}/invitations", s.listInvitations)
				r.Get("/vehicles/{vehicleID}/history", s.history)
			})
		})
		r.Get("/", func(w http.ResponseWriter, _ *http.Request) {
			writeJSON(w, http.StatusOK, map[string]string{"service": "kilora", "version": "v1"})
		})
	})

	return r
}
