package httpserver

import (
	"context"
	"github.com/jackc/pgx/v5/pgxpool"
	"kilora/api/internal/auth"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestDemoDisabled(t *testing.T) {
	h := NewRouter(Deps{})
	r := httptest.NewRecorder()
	h.ServeHTTP(r, httptest.NewRequest("GET", "/api/v1/public/demo", nil))
	if r.Code != 200 || !strings.Contains(r.Body.String(), `"enabled":false`) || !strings.Contains(r.Body.String(), `"accounts":[]`) {
		t.Fatal(r.Code, r.Body.String())
	}
	r = httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/v1/auth/demo", strings.NewReader(`{"role":"taller"}`))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(r, req)
	if r.Code != 404 {
		t.Fatal(r.Code)
	}
}

func TestDemoLoginAndPasswordReset(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL no definida")
	}
	ctx := context.Background()
	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var id string
	err = db.QueryRow(ctx, "SELECT id FROM app_user WHERE email='taller@demo.kilora.app'").Scan(&id)
	if err != nil {
		t.Skip("ejecuta pnpm db:seed para esta prueba")
	}
	token, err := auth.NewToken()
	if err != nil {
		t.Fatal(err)
	}
	hash := auth.HashToken(token)
	_, err = db.Exec(ctx, "INSERT INTO auth_token(token_hash,user_id,purpose,expires_at) VALUES($1,$2,'reset_password',now()+interval '1 hour')", hash, id)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Exec(ctx, "DELETE FROM auth_token WHERE token_hash=$1", hash)
	h := NewRouter(Deps{DB: db, DemoMode: true})
	r := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/v1/auth/demo", strings.NewReader(`{"role":"taller"}`))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(r, req)
	if r.Code != 204 || len(r.Result().Cookies()) == 0 {
		t.Fatalf("login %d %s", r.Code, r.Body.String())
	}
	cookie := r.Result().Cookies()[0]
	defer db.Exec(ctx, "DELETE FROM session WHERE id=$1", auth.HashToken(cookie.Value))
	r = httptest.NewRecorder()
	req = httptest.NewRequest("GET", "/api/v1/auth/me", nil)
	req.AddCookie(cookie)
	h.ServeHTTP(r, req)
	if r.Code != 200 || !strings.Contains(r.Body.String(), "Taller Los Volcanes") {
		t.Fatalf("me %d %s", r.Code, r.Body.String())
	}
	r = httptest.NewRecorder()
	req = httptest.NewRequest("POST", "/api/v1/auth/reset-password", strings.NewReader(`{"token":"`+token+`","password":"nueva1234"}`))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(r, req)
	if r.Code != 403 || !strings.Contains(r.Body.String(), "Las cuentas demo") {
		t.Fatalf("reset %d %s", r.Code, r.Body.String())
	}
}
