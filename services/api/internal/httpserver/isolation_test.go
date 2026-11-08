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

func TestWorkshopIsolation(t *testing.T) {
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
	setup := func(c *http.Client) (string, string, uuid.UUID) {
		reg := req(c, "POST", "/api/v1/auth/register", fmt.Sprintf(`{"email":%q,"password":"password123","full_name":"Prueba"}`, uuid.NewString()+"@example.com"), 201).(map[string]any)
		uid := uuid.MustParse(reg["user"].(map[string]any)["id"].(string))
		work := req(c, "POST", "/api/v1/workshops", `{"name":"Taller","branch_name":"Principal"}`, 201).(map[string]any)
		return "/api/v1/workshops/" + work["id"].(string), work["branch_id"].(string), uid
	}
	a, b := client(), client()
	pa, ba, _ := setup(a)
	pb, bb, _ := setup(b)
	vehicle := req(a, "POST", pa+"/vehicles", `{"make":"Toyota","model":"Yaris","plate":" p-123 ","contact_phone":"7777-8888"}`, 201).(map[string]any)
	vid := vehicle["id"].(string)
	if vehicle["plate"] != "P123" || vehicle["contact_phone"] != "+50377778888" {
		t.Fatal(vehicle)
	}
	order := req(a, "POST", pa+"/work-orders", fmt.Sprintf(`{"vehicle_id":%q,"branch_id":%q,"reason":"Revisión"}`, vid, ba), 201).(map[string]any)
	oid := order["id"].(string)
	job := req(a, "POST", pa+"/work-orders/"+oid+"/jobs", `{"description":"Revisión","labor_price":"12.50","internal_cost":"3.00","mechanic_notes":"secreto mecánico"}`, 201).(map[string]any)
	jid := job["id"].(string)
	part := req(a, "POST", pa+"/work-orders/"+oid+"/jobs/"+jid+"/parts", `{"name":"Filtro"}`, 201).(map[string]any)
	pid := part["id"].(string)
	paths := []struct{ method, path, body string }{{"GET", "/vehicles/" + vid, ""}, {"GET", "/vehicles/" + vid + "/history", ""}, {"POST", "/work-orders", fmt.Sprintf(`{"vehicle_id":%q,"branch_id":%q,"reason":"x"}`, vid, ba)}, {"GET", "/work-orders/" + oid, ""}, {"PATCH", "/work-orders/" + oid + "/status", `{"status":"diagnostico"}`}, {"POST", "/work-orders/" + oid + "/jobs", `{"description":"x"}`}, {"DELETE", "/work-orders/" + oid + "/jobs/" + jid, ""}, {"POST", "/work-orders/" + oid + "/jobs/" + jid + "/parts", `{"name":"x"}`}, {"DELETE", "/work-orders/" + oid + "/jobs/" + jid + "/parts/" + pid, ""}}
	for _, p := range paths {
		if p.method == "POST" && p.path == "/work-orders" {
			req(b, "POST", pb+p.path, fmt.Sprintf(`{"vehicle_id":%q,"branch_id":%q,"reason":"x"}`, vid, bb), 404)
			req(b, "POST", pa+p.path, p.body, 403)
			continue
		}
		req(b, p.method, pb+p.path, p.body, 404)
		req(b, p.method, pa+p.path, p.body, 403)
	}
	for _, p := range []string{"/vehicles", "/work-orders"} {
		v := req(b, "GET", pb+p, "", 200).([]any)
		if len(v) != 0 {
			t.Fatalf("lista no vacía: %v", v)
		}
	}
	vb := req(b, "POST", pb+"/vehicles", `{"make":"Honda","model":"Civic"}`, 201).(map[string]any)["id"].(string)
	req(a, "GET", pa+"/vehicles/"+vb, "", 404)
	req(a, "GET", pb+"/vehicles/"+vb, "", 403)
	q := sqlc.New(db)
	wid := uuid.MustParse(strings.TrimPrefix(pa, "/api/v1/workshops/"))
	branch2, e := q.CreateBranch(context.Background(), sqlc.CreateBranchParams{WorkshopID: dbUUID(wid), Name: uuid.NewString()})
	if e != nil {
		t.Fatal(e)
	}
	for _, role := range []sqlc.MembershipRole{sqlc.MembershipRoleRecepcion, sqlc.MembershipRoleMecanico} {
		c := client()
		_, _, uid := setup(c)
		_, e = q.CreateMembership(context.Background(), sqlc.CreateMembershipParams{UserID: dbUUID(uid), WorkshopID: dbUUID(wid), BranchID: dbUUID(uuid.MustParse(ba)), Role: role})
		if e != nil {
			t.Fatal(e)
		}
		req(c, "GET", pa+"/vehicles/"+vid, "", 200)
		if role == sqlc.MembershipRoleRecepcion {
			req(c, "POST", pa+"/work-orders", fmt.Sprintf(`{"vehicle_id":%q,"branch_id":%q,"reason":"x"}`, vid, uuid.UUID(branch2.ID.Bytes)), 403)
		} else {
			req(c, "POST", pa+"/vehicles", `{"make":"x","model":"y"}`, 403)
		}
	}
	// La constancia y la publicación permanecen aisladas por taller.
	op := pa + "/work-orders/" + oid
	req(a, "PATCH", op, `{"public_notes":"nota pública","internal_notes":"secreto interno"}`, 200)
	req(a, "POST", op+"/jobs/"+jid+"/parts", `{"name":"Pieza","quantity":"2","unit_price":"7.25","internal_cost":"4.00"}`, 201)
	req(a, "PUT", op+"/quote", `{"items":[{"kind":"mano_de_obra","description":"Servicio","quantity":"1","unit_price":"30.00"}]}`, 200)
	req(b, "GET", pb+"/work-orders/"+oid+"/quote", "", 404)
	req(b, "PUT", pb+"/work-orders/"+oid+"/quote", `{"items":[]}`, 404)
	share := req(a, "POST", op+"/quote/share", "", 200).(map[string]any)
	token := strings.Split(share["url"].(string), "/c/")[1]
	public := req(&http.Client{}, "GET", "/api/v1/public/quotes/"+token, "", 200)
	encoded, _ := json.Marshal(public)
	if strings.Contains(string(encoded), "secreto interno") || strings.Contains(string(encoded), "internal_") || strings.Contains(string(encoded), "contact_") || strings.Contains(string(encoded), "secreto mecánico") {
		t.Fatal(string(encoded))
	}
	share2 := req(a, "POST", op+"/quote/share", "", 200).(map[string]any)
	req(&http.Client{}, "GET", "/api/v1/public/quotes/"+token, "", 404)
	token2 := strings.Split(share2["url"].(string), "/c/")[1]
	_, e = db.Exec(context.Background(), "UPDATE quote SET share_expires_at=now()-interval '1 second' WHERE work_order_id=$1", oid)
	if e != nil {
		t.Fatal(e)
	}
	req(&http.Client{}, "GET", "/api/v1/public/quotes/"+token2, "", 404)
	req(a, "PATCH", op+"/quote/outcome", `{"outcome":"acepto"}`, 200)
	req(a, "PUT", op+"/quote", `{"items":[{"kind":"repuesto","description":"x","quantity":"1","unit_price":"1"}]}`, 409)
	req(a, "PATCH", op+"/status", `{"status":"diagnostico"}`, 200)
	req(a, "PATCH", op+"/status", `{"status":"en_reparacion"}`, 200)
	req(a, "PATCH", op+"/status", `{"status":"listo"}`, 200)
	req(a, "PATCH", op+"/status", `{"status":"listo"}`, 409)
	var total, internal string
	e = db.QueryRow(context.Background(), "SELECT total::text,internal_cost::text FROM history_record WHERE work_order_id=$1", oid).Scan(&total, &internal)
	if e != nil || total != "27.00" || internal != "7.00" {
		t.Fatalf("snapshot: %s %s %v", total, internal, e)
	}
	detail := req(a, "GET", op, "", 200).(map[string]any)
	if detail["history_record_id"] == nil || detail["quote_comparison"] == nil {
		t.Fatal(detail)
	}
	_, e = db.Exec(context.Background(), "INSERT INTO vehicle_link(vehicle_id,workshop_id) VALUES($1,$2) ON CONFLICT DO NOTHING", vid, strings.TrimPrefix(pb, "/api/v1/workshops/"))
	if e != nil {
		t.Fatal(e)
	}
	blind := req(b, "GET", pb+"/vehicles/"+vid+"/history", "", 200)
	encoded, _ = json.Marshal(blind)
	if strings.Contains(string(encoded), "secreto interno") || strings.Contains(string(encoded), "27.00") || strings.Contains(string(encoded), "nota pública") || strings.Contains(string(encoded), "secreto mecánico") {
		t.Fatal(string(encoded))
	}
	emptyOrder := req(a, "POST", pa+"/work-orders", fmt.Sprintf(`{"vehicle_id":%q,"branch_id":%q,"reason":"Sin trabajos"}`, vid, ba), 201).(map[string]any)["id"].(string)
	emptyPath := pa + "/work-orders/" + emptyOrder + "/status"
	req(a, "PATCH", emptyPath, `{"status":"diagnostico"}`, 200)
	req(a, "PATCH", emptyPath, `{"status":"en_reparacion"}`, 200)
	req(a, "PATCH", emptyPath, `{"status":"listo"}`, 409)

}
func TestNormalizationAndTransitions(t *testing.T) {
	if normalizePlate(" p - 123 ") != "P123" {
		t.Fatal("placa")
	}
	for _, s := range []string{"77778888", "+503 7777-8888", "50377778888"} {
		if p, ok := normalizePhone(s); !ok || p != "+50377778888" {
			t.Fatal(s, p)
		}
	}
	if _, ok := normalizePhone("123"); ok {
		t.Fatal("teléfono inválido")
	}
	for _, v := range []struct {
		a, b string
		want bool
	}{{"recibido", "diagnostico", true}, {"diagnostico", "en_reparacion", true}, {"en_reparacion", "listo", true}, {"recibido", "cancelado", true}, {"listo", "cancelado", false}, {"recibido", "listo", false}} {
		if validTransition(v.a, v.b) != v.want {
			t.Fatal(v)
		}
	}
}
