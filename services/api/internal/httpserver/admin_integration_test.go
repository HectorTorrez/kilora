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
)

func TestRecommendationsMembersAndAudit(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL no definida")
	}
	db, e := pgxpool.New(context.Background(), url)
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	srv := httptest.NewServer(NewRouter(Deps{DB: db, Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), Mailer: &fakeMailer{}}))
	defer srv.Close()
	client := func() *http.Client { jar, _ := cookiejar.New(nil); return &http.Client{Jar: jar} }
	req := func(c *http.Client, method, path, body string, want int) any {
		t.Helper()
		r, _ := http.NewRequest(method, srv.URL+path, strings.NewReader(body))
		if body != "" {
			r.Header.Set("Content-Type", "application/json")
		}
		resp, err := c.Do(r)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		data, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != want {
			t.Fatalf("%s %s: %d, esperaba %d: %s", method, path, resp.StatusCode, want, data)
		}
		var v any
		if len(data) > 0 {
			_ = json.Unmarshal(data, &v)
		}
		return v
	}
	register := func(c *http.Client) string {
		email := uuid.NewString() + "@example.com"
		req(c, "POST", "/api/v1/auth/register", fmt.Sprintf(`{"email":%q,"password":"password123","full_name":"Prueba"}`, email), 201)
		return email
	}
	setup := func(c *http.Client) (string, string) {
		register(c)
		work := req(c, "POST", "/api/v1/workshops", `{"name":"Taller","branch_name":"Principal"}`, 201).(map[string]any)
		return "/api/v1/workshops/" + work["id"].(string), work["branch_id"].(string)
	}
	a, b, c := client(), client(), client()
	pa, ba := setup(a)
	pb, _ := setup(b)
	vid := req(a, "POST", pa+"/vehicles", `{"make":"Toyota","model":"Yaris"}`, 201).(map[string]any)["id"].(string)
	oid := req(a, "POST", pa+"/work-orders", fmt.Sprintf(`{"vehicle_id":%q,"branch_id":%q,"reason":"Revisión"}`, vid, ba), 201).(map[string]any)["id"].(string)

	// Recomendaciones: requieren fecha o kilometraje y quedan aisladas por taller.
	req(a, "POST", pa+"/vehicles/"+vid+"/recommendations", `{"description":"Cambiar pastillas"}`, 400)
	rec := req(a, "POST", pa+"/vehicles/"+vid+"/recommendations", fmt.Sprintf(`{"description":"Cambiar pastillas","category":"frenos","due_km":90000,"due_date":"2027-01-15","work_order_id":%q}`, oid), 201).(map[string]any)
	if rec["status"] != "pendiente" || rec["due_date"] != "2027-01-15" || rec["category"] != "frenos" || rec["work_order_id"] != oid {
		t.Fatal(rec)
	}
	rid := rec["id"].(string)
	if list := req(a, "GET", pa+"/vehicles/"+vid+"/recommendations", "", 200).([]any); len(list) != 1 {
		t.Fatal(list)
	}
	if list := req(a, "GET", pa+"/recommendations?status=pendiente", "", 200).([]any); len(list) != 1 || list[0].(map[string]any)["model"] != "Yaris" {
		t.Fatal(list)
	}
	req(b, "GET", pb+"/vehicles/"+vid+"/recommendations", "", 404)
	req(b, "POST", pb+"/vehicles/"+vid+"/recommendations", `{"description":"x","due_km":1}`, 404)
	req(b, "PATCH", pb+"/recommendations/"+rid, `{"status":"hecha"}`, 404)
	req(b, "GET", pa+"/recommendations", "", 403)
	req(a, "PATCH", pa+"/recommendations/"+rid, `{"status":"pendiente"}`, 400)
	if done := req(a, "PATCH", pa+"/recommendations/"+rid, `{"status":"hecha"}`, 200).(map[string]any); done["status"] != "hecha" || done["resolved_at"] == nil {
		t.Fatal(done)
	}
	req(a, "PATCH", pa+"/recommendations/"+rid, `{"status":"descartada"}`, 404)
	if list := req(a, "GET", pa+"/recommendations?status=pendiente", "", 200).([]any); len(list) != 0 {
		t.Fatal(list)
	}

	// Miembros: solo el admin agrega o quita; no se puede quitar al último admin.
	emailC := register(c)
	req(a, "POST", pa+"/members", fmt.Sprintf(`{"email":%q,"branch_id":%q,"role":"recepcion"}`, "nadie-"+uuid.NewString()+"@example.com", ba), 404)
	added := req(a, "POST", pa+"/members", fmt.Sprintf(`{"email":%q,"branch_id":%q,"role":"recepcion"}`, strings.ToUpper(emailC), ba), 201).(map[string]any)
	req(a, "POST", pa+"/members", fmt.Sprintf(`{"email":%q,"branch_id":%q,"role":"mecanico"}`, emailC, ba), 409)
	members := req(c, "GET", pa+"/members", "", 200).([]any)
	if len(members) != 2 {
		t.Fatal(members)
	}
	req(c, "POST", pa+"/members", fmt.Sprintf(`{"email":%q,"branch_id":%q,"role":"admin"}`, emailC, ba), 403)
	req(c, "GET", pa+"/audit", "", 403)
	var adminID string
	for _, m := range members {
		if mm := m.(map[string]any); mm["role"] == "admin" {
			adminID = mm["id"].(string)
		}
	}
	req(a, "DELETE", pa+"/members/"+adminID, "", 409)
	req(b, "DELETE", pb+"/members/"+added["id"].(string), "", 404)
	req(a, "DELETE", pa+"/members/"+added["id"].(string), "", 204)
	req(c, "GET", pa+"/members", "", 403)

	// Auditoría: el admin ve su bitácora, en orden descendente.
	events := req(a, "GET", pa+"/audit?limit=5", "", 200).([]any)
	if len(events) == 0 || events[0].(map[string]any)["action"] != "membership.delete" {
		t.Fatal(events)
	}
	first := int(events[0].(map[string]any)["id"].(float64))
	older := req(a, "GET", fmt.Sprintf("%s/audit?before=%d", pa, first), "", 200).([]any)
	for _, ev := range older {
		if int(ev.(map[string]any)["id"].(float64)) >= first {
			t.Fatal("cursor no filtra")
		}
	}
	req(a, "GET", pa+"/audit?limit=0", "", 400)
	if ws := req(a, "GET", pa, "", 200).(map[string]any); ws["role"] != "admin" {
		t.Fatal(ws)
	}
}
