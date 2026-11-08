package httpserver

import (
	"context"
	"errors"
	"net/http"

	"github.com/google/uuid"
	"kilora/api/internal/database"
	"kilora/api/internal/database/sqlc"
)

var errDemoPassword = errors.New("demo password")

type demoAccount struct {
	Role        string `json:"role"`
	Label       string `json:"label"`
	Email       string `json:"email"`
	Password    string `json:"password"`
	Description string `json:"description"`
}

var demoAccounts = []demoAccount{
	{"taller", "Taller Los Volcanes", "taller@demo.kilora.app", "demo1234", "Registra órdenes, cotiza y publica servicios."},
	{"propietario", "María Hernández", "propietario@demo.kilora.app", "demo1234", "Consulta el historial completo de tu vehículo."},
	{"taller_competencia", "AutoServicio La Ceiba", "ceiba@demo.kilora.app", "demo1234", "Consulta la vista ciega de otro taller."},
}

func (s *server) publicDemo(w http.ResponseWriter, _ *http.Request) {
	accounts := []demoAccount{}
	if s.demoMode {
		accounts = demoAccounts
	}
	writeJSON(w, 200, map[string]any{"enabled": s.demoMode, "accounts": accounts})
}
func (s *server) demoLogin(w http.ResponseWriter, r *http.Request) {
	if !s.demoMode {
		http.NotFound(w, r)
		return
	}
	var in struct {
		Role string `json:"role"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !s.limiter.allow(clientIP(r) + "|demo") {
		fail(w, 429, "Demasiados intentos. Intenta más tarde")
		return
	}
	var email string
	for _, a := range demoAccounts {
		if a.Role == in.Role {
			email = a.Email
			break
		}
	}
	if email == "" {
		fail(w, 400, "Rol inválido")
		return
	}
	user, err := sqlc.New(s.db).GetUserByEmail(r.Context(), email)
	if err != nil {
		fail(w, 500, "Demo no disponible")
		return
	}
	var token string
	err = database.WithTx(r.Context(), s.db, func(q *sqlc.Queries) error {
		var e error
		token, e = createSession(context.Background(), q, uuid.UUID(user.ID.Bytes), r)
		return e
	})
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	s.setCookie(w, token)
	w.WriteHeader(204)
}
