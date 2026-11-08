package httpserver

import (
	"net/http"

	"kilora/api/internal/auth"
	"kilora/api/internal/database/sqlc"
)

type demoAccount struct {
	Role        string `json:"role"`
	Label       string `json:"label"`
	Email       string `json:"email"`
	Password    string `json:"password"`
	Description string `json:"description"`
}

var demoAccounts = []demoAccount{
	{"taller", "Taller Los Volcanes", auth.DemoWorkshopEmail, auth.DemoPassword, "Registra órdenes, cotiza y publica servicios."},
	{"propietario", "María Hernández", auth.DemoOwnerEmail, auth.DemoPassword, "Consulta el historial completo de tu vehículo."},
	{"taller_competencia", "AutoServicio La Ceiba", auth.DemoRivalEmail, auth.DemoPassword, "Consulta la vista ciega de otro taller."},
}

func (s *server) publicDemo(w http.ResponseWriter, _ *http.Request) error {
	accounts := []demoAccount{}
	if s.demoMode {
		accounts = demoAccounts
	}
	writeJSON(w, http.StatusOK, map[string]any{"enabled": s.demoMode, "accounts": accounts})
	return nil
}

func (s *server) demoLogin(w http.ResponseWriter, r *http.Request) error {
	if !s.demoMode {
		http.NotFound(w, r)
		return nil
	}
	var in struct {
		Role string `json:"role"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	if !s.limiter.allow(clientIP(r)+"|demo", loginAttemptLimit) {
		return httpError{http.StatusTooManyRequests, "Demasiados intentos. Intenta más tarde"}
	}
	var email string
	for _, a := range demoAccounts {
		if a.Role == in.Role {
			email = a.Email
			break
		}
	}
	if email == "" {
		return badRequest("Rol inválido")
	}
	user, err := sqlc.New(s.db).GetUserByEmail(r.Context(), email)
	if err != nil {
		s.logger.Error("demo no disponible", "error", err)
		return httpError{http.StatusInternalServerError, "Demo no disponible"}
	}
	return s.startSession(w, r, user.ID)
}
