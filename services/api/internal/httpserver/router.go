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
		r.Get("/public/demo", s.handle(s.publicDemo))
		r.Post("/auth/demo", s.handle(s.demoLogin))
		r.Get("/public/quotes/{token}", s.handle(s.publicQuote))
		r.Get("/public/invitations/{token}", s.handle(s.publicInvitation))
		r.Post("/auth/register", s.handle(s.register))
		r.Post("/auth/login", s.handle(s.login))
		r.Post("/auth/logout", s.handle(s.logout))
		r.Post("/auth/verify-email", s.handle(s.verify))
		r.Post("/auth/forgot-password", s.handle(s.forgot))
		r.Post("/auth/reset-password", s.handle(s.reset))
		r.Group(func(r chi.Router) {
			r.Use(requireUser)
			r.Get("/auth/me", s.handle(s.me))
			r.Post("/invitations/{token}/accept", s.handle(s.acceptInvitation))
			r.Post("/workshops", s.handle(s.createWorkshop))
			r.Get("/me/vehicles", s.handle(s.listOwnerVehicles))
			r.Post("/me/vehicles", s.handle(s.createOwnerVehicle))
			r.Get("/me/vehicles/{vehicleID}", s.handle(s.getOwnerVehicle))
			r.Post("/me/vehicles/{vehicleID}/history", s.handle(s.manualHistory))
			r.Post("/me/vehicles/{vehicleID}/corrections", s.handle(s.ownerCorrection))
			r.Post("/me/vehicles/{vehicleID}/odometer", s.handle(s.addOdometer))
			r.Put("/me/vehicles/{vehicleID}/body-type", s.handle(s.setOwnerBodyType))
			r.Get("/me/vehicles/{vehicleID}/history", s.handle(s.ownerHistory))
			r.Route("/workshops/{workshopID}", func(r chi.Router) {
				r.Use(s.requireWorkshop)
				r.Get("/", s.inWorkshop(s.getWorkshop))
				r.Patch("/", s.inWorkshop(s.updateWorkshop))
				r.Post("/work-orders", s.inWorkshop(s.createOrder))
				r.Get("/work-orders", s.inWorkshop(s.listOrders))
				r.Get("/work-orders/page", s.inWorkshop(s.listOrdersPage))
				r.Get("/work-orders/{orderID}", s.inWorkshop(s.getOrder))
				r.Patch("/work-orders/{orderID}", s.inWorkshop(s.editOrder))
				r.Patch("/work-orders/{orderID}/status", s.inWorkshop(s.changeStatus))
				r.Put("/work-orders/{orderID}/quote", s.inWorkshop(s.saveQuote))
				r.Get("/work-orders/{orderID}/quote", s.inWorkshop(s.getQuote))
				r.Post("/work-orders/{orderID}/quote/share", s.inWorkshop(s.shareQuote))
				r.Patch("/work-orders/{orderID}/quote/outcome", s.inWorkshop(s.quoteOutcome))
				r.Post("/quotes", s.inWorkshop(s.createCounterQuote))
				r.Get("/quotes", s.inWorkshop(s.listCounterQuotes))
				r.Get("/quotes/{quoteID}", s.inWorkshop(s.getCounterQuote))
				r.Put("/quotes/{quoteID}", s.inWorkshop(s.updateCounterQuote))
				r.Patch("/quotes/{quoteID}/outcome", s.inWorkshop(s.counterQuoteOutcome))
				r.Post("/quotes/{quoteID}/share", s.inWorkshop(s.shareCounterQuote))
				r.Post("/quotes/{quoteID}/convert", s.inWorkshop(s.convertCounterQuote))
				r.Post("/work-orders/{orderID}/jobs", s.inWorkshop(s.createJob))
				r.Delete("/work-orders/{orderID}/jobs/{jobID}", s.inWorkshop(s.deleteJob))
				r.Post("/work-orders/{orderID}/jobs/{jobID}/parts", s.inWorkshop(s.createPart))
				r.Delete("/work-orders/{orderID}/jobs/{jobID}/parts/{partID}", s.inWorkshop(s.deletePart))
				r.Get("/vehicles", s.inWorkshop(s.listVehicles))
				r.Get("/vehicles/page", s.inWorkshop(s.listVehiclesPage))
				r.Post("/vehicles", s.inWorkshop(s.createVehicle))
				r.Get("/vehicles/{vehicleID}", s.inWorkshop(s.getVehicle))
				r.Put("/vehicles/{vehicleID}/customer", s.inWorkshop(s.setVehicleCustomer))
				r.Get("/customers/page", s.inWorkshop(s.listCustomersPage))
				r.Post("/customers", s.inWorkshop(s.createCustomer))
				r.Get("/customers/{customerID}", s.inWorkshop(s.getCustomer))
				r.Patch("/customers/{customerID}", s.inWorkshop(s.updateCustomer))
				r.Post("/vehicles/{vehicleID}/invitations", s.inWorkshop(s.createInvitation))
				r.Get("/vehicles/{vehicleID}/invitations", s.inWorkshop(s.listInvitations))
				r.Get("/vehicles/{vehicleID}/history", s.inWorkshop(s.workshopHistory))
				r.Get("/vehicles/{vehicleID}/recommendations", s.inWorkshop(s.listVehicleRecommendations))
				r.Post("/vehicles/{vehicleID}/recommendations", s.inWorkshop(s.createRecommendation))
				r.Get("/recommendations", s.inWorkshop(s.listWorkshopRecommendations))
				r.Patch("/recommendations/{recommendationID}", s.inWorkshop(s.resolveRecommendation))
				r.Get("/members", s.inWorkshop(s.listMembers))
				r.Post("/members", s.inWorkshop(s.addMember))
				r.Delete("/members/{membershipID}", s.inWorkshop(s.removeMember))
				r.Get("/audit", s.inWorkshop(s.listAudit))
				r.Get("/audit/page", s.inWorkshop(s.listAuditPage))
			})
		})
		r.Get("/", func(w http.ResponseWriter, _ *http.Request) {
			writeJSON(w, http.StatusOK, map[string]string{"service": "kilora", "version": "v1"})
		})
	})

	return r
}
