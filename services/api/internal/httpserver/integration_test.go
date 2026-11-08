package httpserver

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
)

type fakeMailer struct {
	mu     sync.Mutex
	bodies []string
}

func (m *fakeMailer) Send(_ context.Context, _, _, body string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.bodies = append(m.bodies, body)
	return nil
}
func TestAuthAndWorkshops(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL no definida")
	}
	db, err := pgxpool.New(context.Background(), url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	mailer := &fakeMailer{}
	srv := httptest.NewServer(NewRouter(Deps{DB: db, Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), WebOrigin: "http://localhost:3300", Mailer: mailer}))
	defer srv.Close()
	client := func() *http.Client { jar, _ := cookiejar.New(nil); return &http.Client{Jar: jar} }
	a, b := client(), client()
	request := func(c *http.Client, method, path, body string, want int) map[string]any {
		t.Helper()
		req, _ := http.NewRequest(method, srv.URL+path, strings.NewReader(body))
		req.Header.Set("Origin", "http://localhost:3300")
		if body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		resp, e := c.Do(req)
		if e != nil {
			t.Fatal(e)
		}
		defer resp.Body.Close()
		data, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != want {
			t.Fatalf("%s %s: %d, esperaba %d: %s", method, path, resp.StatusCode, want, data)
		}
		var result map[string]any
		if len(bytes.TrimSpace(data)) > 0 {
			_ = json.Unmarshal(data, &result)
		}
		return result
	}
	email := uuid.NewString() + "@example.com"
	register := func(c *http.Client, email string) {
		request(c, "POST", "/api/v1/auth/register", fmt.Sprintf(`{"email":%q,"password":"password123","full_name":"Prueba"}`, email), 201)
	}
	register(a, email)
	request(a, "GET", "/api/v1/auth/me", "", 200)
	request(a, "POST", "/api/v1/auth/logout", "", 204)
	request(a, "GET", "/api/v1/auth/me", "", 401)
	request(a, "POST", "/api/v1/auth/login", fmt.Sprintf(`{"email":%q,"password":"incorrecta"}`, email), 401)
	request(a, "POST", "/api/v1/auth/login", fmt.Sprintf(`{"email":%q,"password":"password123"}`, email), 204)
	workshop := request(a, "POST", "/api/v1/workshops", `{"name":"Taller","branch_name":"Principal"}`, 201)
	path := "/api/v1/workshops/" + workshop["id"].(string)
	request(a, "GET", path, "", 200)
	register(b, uuid.NewString()+"@example.com")
	request(b, "GET", path, "", 403)
	request(a, "POST", "/api/v1/auth/forgot-password", fmt.Sprintf(`{"email":%q}`, email), 204)
	mailer.mu.Lock()
	body := mailer.bodies[len(mailer.bodies)-1]
	mailer.mu.Unlock()
	token := strings.Split(body, "token=")[1]
	request(b, "POST", "/api/v1/auth/reset-password", fmt.Sprintf(`{"token":%q,"password":"nueva1234"}`, token), 204)
	request(a, "GET", "/api/v1/auth/me", "", 401)
	request(a, "POST", "/api/v1/auth/reset-password", fmt.Sprintf(`{"token":%q,"password":"nueva1234"}`, token), 400)
	request(a, "POST", "/api/v1/auth/login", fmt.Sprintf(`{"email":%q,"password":"nueva1234"}`, email), 204)
}
