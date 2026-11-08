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

func TestInvitationOwnerFlow(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL no definida")
	}
	ctx := context.Background()
	db, e := pgxpool.New(ctx, dsn)
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	srv := httptest.NewServer(NewRouter(Deps{DB: db, Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), WebOrigin: "http://localhost:3300", Mailer: &fakeMailer{}}))
	defer srv.Close()
	client := func() *http.Client { jar, _ := cookiejar.New(nil); return &http.Client{Jar: jar} }
	req := func(c *http.Client, method, path, body string, want int) []byte {
		t.Helper()
		r, _ := http.NewRequest(method, srv.URL+path, strings.NewReader(body))
		if body != "" {
			r.Header.Set("Content-Type", "application/json")
		}
		res, err := c.Do(r)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		b, _ := io.ReadAll(res.Body)
		if res.StatusCode != want {
			t.Fatalf("%s %s: %d != %d: %s", method, path, res.StatusCode, want, b)
		}
		return b
	}
	decodeMap := func(b []byte) map[string]any {
		t.Helper()
		var m map[string]any
		if err := json.Unmarshal(b, &m); err != nil {
			t.Fatal(err)
		}
		return m
	}
	a, b, owner, other := client(), client(), client(), client()
	email := uuid.NewString() + "@example.com"
	for _, pair := range []struct {
		c     *http.Client
		email string
	}{{a, uuid.NewString() + "@example.com"}, {b, uuid.NewString() + "@example.com"}, {owner, email}, {other, uuid.NewString() + "@example.com"}} {
		req(pair.c, "POST", "/api/v1/auth/register", fmt.Sprintf(`{"email":%q,"password":"password123","full_name":"Prueba"}`, pair.email), 201)
	}
	workshop := func(c *http.Client) (string, string) {
		m := decodeMap(req(c, "POST", "/api/v1/workshops", `{"name":"Taller","branch_name":"Principal"}`, 201))
		return m["id"].(string), m["branch_id"].(string)
	}
	wa, branch := workshop(a)
	wb, _ := workshop(b)
	pa := "/api/v1/workshops/" + wa
	pb := "/api/v1/workshops/" + wb
	v := decodeMap(req(a, "POST", pa+"/vehicles", `{"plate":"p 123-456","make":"Marca","model":"Modelo"}`, 201))
	vid := v["id"].(string)
	vp := pa + "/vehicles/" + vid
	o := decodeMap(req(a, "POST", pa+"/work-orders", fmt.Sprintf(`{"vehicle_id":%q,"branch_id":%q,"reason":"Servicio","internal_notes":"secreto_interno"}`, vid, branch), 201))
	op := pa + "/work-orders/" + o["id"].(string)
	req(a, "PATCH", op, `{"public_notes":"nota pública","internal_notes":"secreto_interno"}`, 200)
	req(a, "POST", op+"/jobs", `{"description":"Filtro","labor_price":"12.50","internal_cost":"3.00","mechanic_notes":"secreto_mecanico"}`, 201)
	for _, status := range []string{"diagnostico", "en_reparacion", "listo"} {
		req(a, "PATCH", op+"/status", fmt.Sprintf(`{"status":%q}`, status), 200)
	}
	invite := func() string {
		m := decodeMap(req(a, "POST", vp+"/invitations", fmt.Sprintf(`{"email":%q}`, email), 201))
		parts := strings.Split(m["url"].(string), "/")
		return parts[len(parts)-1]
	}
	old := invite()
	token := invite()
	req(other, "GET", "/api/v1/public/invitations/"+old, "", 404)
	req(b, "POST", pb+"/vehicles/"+vid+"/invitations", fmt.Sprintf(`{"email":%q}`, email), 404)
	pub := string(req(other, "GET", "/api/v1/public/invitations/"+token, "", 200))
	if strings.Contains(pub, token) || strings.Contains(pub, email) || strings.Contains(pub, "secreto") {
		t.Fatal(pub)
	}
	accept := "/api/v1/invitations/" + token + "/accept"
	req(owner, "POST", accept, `{"consent":false}`, 400)
	req(other, "POST", accept, `{"consent":true}`, 403)
	req(owner, "POST", accept, `{"consent":true}`, 200)
	req(owner, "POST", accept, `{"consent":true}`, 404)
	req(other, "GET", "/api/v1/me/vehicles/"+vid, "", 404)
	list := string(req(owner, "GET", "/api/v1/me/vehicles", "", 200))
	if !strings.Contains(list, vid) {
		t.Fatal(list)
	}
	hist := string(req(owner, "GET", "/api/v1/me/vehicles/"+vid+"/history", "", 200))
	for _, s := range []string{"secreto_interno", "secreto_mecanico", "internal_cost", "mechanic_notes"} {
		if strings.Contains(hist, s) {
			t.Fatal(hist)
		}
	}
	for _, s := range []string{"12.50", "nota pública"} {
		if !strings.Contains(hist, s) {
			t.Fatal(hist)
		}
	}
	var historyResult struct {
		Records []struct {
			ID string `json:"id"`
		} `json:"records"`
	}
	_ = json.Unmarshal([]byte(hist), &historyResult)
	req(owner, "POST", "/api/v1/me/vehicles/"+vid+"/corrections", fmt.Sprintf(`{"history_record_id":%q,"reason":"error","changes":{"summary":"nuevo"}}`, historyResult.Records[0].ID), 403)
	req(owner, "POST", "/api/v1/me/vehicles/"+vid+"/odometer", `{"km":100}`, 201)
	warning := string(req(owner, "POST", "/api/v1/me/vehicles/"+vid+"/odometer", `{"km":90}`, 201))
	if !strings.Contains(warning, "100 km") {
		t.Fatal(warning)
	}
	manual := decodeMap(req(owner, "POST", "/api/v1/me/vehicles/"+vid+"/history", `{"performed_on":"2020-01-01","summary":"Manual privado","items":[{"kind":"trabajo","description":"Cambio","price":"10.00"}],"workshop_name_text":"Otro taller"}`, 201))
	req(owner, "POST", "/api/v1/me/vehicles/"+vid+"/corrections", fmt.Sprintf(`{"history_record_id":%q,"reason":"detalle","changes":{"summary":"Corregido"}}`, manual["id"]), 201)
	corrected := string(req(owner, "GET", "/api/v1/me/vehicles/"+vid+"/history", "", 200))
	if !strings.Contains(corrected, "Corregido") {
		t.Fatal(corrected)
	}
	id, _ := uuid.Parse(vid)
	wid, _ := uuid.Parse(wb)
	if err := sqlc.New(db).LinkVehicleToWorkshop(ctx, sqlc.LinkVehicleToWorkshopParams{VehicleID: dbUUID(id), WorkshopID: dbUUID(wid)}); err != nil {
		t.Fatal(err)
	}
	blind := string(req(b, "GET", pb+"/vehicles/"+vid+"/history", "", 200))
	if !strings.Contains(blind, "Cambio") || strings.Contains(blind, "10.00") || strings.Contains(blind, "Otro taller") {
		t.Fatal(blind)
	}
}
