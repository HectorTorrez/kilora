package httpserver

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"kilora/api/internal/database/sqlc"
)

const testOrigin = "http://localhost:3300"

type testAPI struct {
	t   *testing.T
	db  *pgxpool.Pool
	q   *sqlc.Queries
	srv *httptest.Server
}

func newTestAPI(t *testing.T) *testAPI {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL no definida")
	}
	db, err := pgxpool.New(context.Background(), url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	srv := httptest.NewServer(NewRouter(Deps{DB: db, Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), WebOrigin: testOrigin, Mailer: &fakeMailer{}}))
	t.Cleanup(srv.Close)
	return &testAPI{t: t, db: db, q: sqlc.New(db), srv: srv}
}

func (a *testAPI) client() *http.Client {
	jar, _ := cookiejar.New(nil)
	return &http.Client{Jar: jar}
}

func (a *testAPI) req(c *http.Client, method, path, body string, want int) any {
	a.t.Helper()
	r, _ := http.NewRequest(method, a.srv.URL+path, strings.NewReader(body))
	r.Header.Set("Origin", testOrigin)
	if body != "" {
		r.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.Do(r)
	if err != nil {
		a.t.Fatal(err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != want {
		a.t.Fatalf("%s %s: %d, esperaba %d: %s", method, path, resp.StatusCode, want, data)
	}
	var v any
	if len(data) > 0 {
		_ = json.Unmarshal(data, &v)
	}
	return v
}

func (a *testAPI) obj(c *http.Client, method, path, body string, want int) map[string]any {
	a.t.Helper()
	return a.req(c, method, path, body, want).(map[string]any)
}

func (a *testAPI) register(c *http.Client) (uuid.UUID, string) {
	a.t.Helper()
	email := uuid.NewString() + "@example.com"
	reg := a.obj(c, "POST", "/api/v1/auth/register", fmt.Sprintf(`{"email":%q,"password":"password123","full_name":"Prueba"}`, email), 201)
	return uuid.MustParse(reg["user"].(map[string]any)["id"].(string)), email
}

// workshop registers a new admin with one workshop and returns the workshop's API path and branch.
func (a *testAPI) workshop(c *http.Client) (path string, id, branch uuid.UUID, user uuid.UUID) {
	a.t.Helper()
	user, _ = a.register(c)
	work := a.obj(c, "POST", "/api/v1/workshops", `{"name":"Taller","branch_name":"Principal"}`, 201)
	id = uuid.MustParse(work["id"].(string))
	return "/api/v1/workshops/" + id.String(), id, uuid.MustParse(work["branch_id"].(string)), user
}

func (a *testAPI) branch(workshop uuid.UUID) uuid.UUID {
	a.t.Helper()
	b, err := a.q.CreateBranch(context.Background(), sqlc.CreateBranchParams{WorkshopID: workshop, Name: uuid.NewString()})
	if err != nil {
		a.t.Fatal(err)
	}
	return b.ID
}

func (a *testAPI) member(c *http.Client, workshop, branch uuid.UUID, role sqlc.MembershipRole) {
	a.t.Helper()
	user, _ := a.register(c)
	if _, err := a.q.CreateMembership(context.Background(), sqlc.CreateMembershipParams{UserID: user, WorkshopID: workshop, BranchID: branch, Role: role}); err != nil {
		a.t.Fatal(err)
	}
}

func mustUser(t *testing.T, a *testAPI, c *http.Client) uuid.UUID {
	t.Helper()
	me := a.obj(c, "GET", "/api/v1/auth/me", "", 200)
	return uuid.MustParse(me["user"].(map[string]any)["id"].(string))
}
