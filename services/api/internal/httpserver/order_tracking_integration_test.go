package httpserver

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"kilora/api/internal/auth"
	"kilora/api/internal/database/sqlc"
)

func trackingToken(t *testing.T, share map[string]any) string {
	t.Helper()
	_, token, ok := strings.Cut(share["url"].(string), "/estado/")
	if !ok || len(token) != 43 {
		t.Fatal(share)
	}
	return token
}

func TestOrderTrackingPublicProjectionAndLifecycle(t *testing.T) {
	a := newTestAPI(t)
	staff := a.client()
	path, _, branch, _ := a.workshop(staff)
	vehicle := a.obj(staff, "POST", path+"/vehicles", `{"make":"Toyota","model":"Corolla","year":2015,"plate":"P987654","customer":{"full_name":"Cliente Oculto","phone":"7100-0009"}}`, 201)["id"].(string)
	order := a.obj(staff, "POST", path+"/work-orders", fmt.Sprintf(`{"vehicle_id":%q,"branch_id":%q,"reason":"intake-secret","internal_notes":"secret-internal"}`, vehicle, branch), 201)
	orderPath := path + "/work-orders/" + order["id"].(string)
	endpoint := orderPath + "/tracking"
	a.req(staff, "PATCH", orderPath, `{"public_notes":"history-note-not-tracking","internal_notes":"secret-internal"}`, 200)
	a.req(staff, "POST", orderPath+"/jobs", `{"description":"secret-job","labor_price":"999.99","internal_cost":"555.55","mechanic_notes":"secret-mechanic"}`, 201)
	a.req(staff, "PUT", orderPath+"/quote", `{"items":[{"kind":"mano_de_obra","description":"secret-quote","quantity":"1","unit_price":"123.45"}]}`, 200)
	initial := a.obj(staff, "GET", endpoint, "", 200)
	if initial["share"] != nil || initial["customer_update"] != nil || initial["estimated_ready_at"] != nil {
		t.Fatal(initial)
	}
	eta := time.Now().UTC().Add(24 * time.Hour).Truncate(time.Second)
	body := fmt.Sprintf(`{"customer_update":"Ya llegaron los repuestos.","estimated_ready_at":%q}`, eta.Format(time.RFC3339))
	a.req(staff, "PUT", endpoint, body, 204)
	share := a.obj(staff, "POST", endpoint+"/share", "", 201)
	token := trackingToken(t, share)
	publicPath := "/api/v1/public/order-tracking/" + token
	public := a.obj(a.client(), "GET", publicPath, "", 200)
	if public["status"] != "recibido" || public["customer_update"] != "Ya llegaron los repuestos." || public["workshop_name"] != "Taller" {
		t.Fatal(public)
	}
	parsed, err := time.Parse(time.RFC3339, public["estimated_ready_at"].(string))
	if err != nil || !parsed.Equal(eta) {
		t.Fatal(public)
	}
	allowed := map[string]bool{"number": true, "status": true, "customer_update": true, "estimated_ready_at": true, "updated_at": true, "received_at": true, "completed_at": true, "cancelled_at": true, "workshop_name": true, "branch_name": true, "vehicle": true, "expires_at": true}
	if len(public) != len(allowed) {
		t.Fatal(public)
	}
	for key := range public {
		if !allowed[key] {
			t.Fatalf("unexpected public field %s", key)
		}
	}
	publicVehicle := public["vehicle"].(map[string]any)
	if len(publicVehicle) != 3 || publicVehicle["make"] != "Toyota" || publicVehicle["model"] != "Corolla" || publicVehicle["year"] != float64(2015) {
		t.Fatal(publicVehicle)
	}
	data, _ := json.Marshal(public)
	for _, secret := range []string{"secret-", "intake-secret", "history-note-not-tracking", "Cliente Oculto", "71000009", "P987654", vehicle, order["id"].(string), "999.99", "555.55", "123.45", "token_hash"} {
		if strings.Contains(string(data), secret) {
			t.Fatalf("public leak %s: %s", secret, data)
		}
	}
	response, err := a.client().Get(a.srv.URL + publicPath)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.Header.Get("Cache-Control") != "no-store" || response.Header.Get("Referrer-Policy") != "no-referrer" || !strings.Contains(response.Header.Get("X-Robots-Tag"), "noindex") {
		t.Fatal(response.Header)
	}
	var hash string
	if err := a.db.QueryRow(context.Background(), `SELECT token_hash FROM work_order_tracking_share WHERE work_order_id=$1`, order["id"]).Scan(&hash); err != nil || hash != auth.HashToken(token) || hash == token {
		t.Fatalf("stored token: %v", err)
	}
	meta := a.raw(staff, "GET", endpoint, "", 200)
	if strings.Contains(string(meta), token) || strings.Contains(string(meta), hash) {
		t.Fatal("token recoverable from read endpoint")
	}
	// Private edits do not publish an update or change the public update time.
	updatedAt := public["updated_at"]
	a.req(staff, "PATCH", orderPath, `{"internal_notes":"changed-private-note"}`, 200)
	if next := a.obj(a.client(), "GET", publicPath, "", 200); next["updated_at"] != updatedAt {
		t.Fatal("private activity changed public update time")
	}
	for _, status := range []string{"diagnostico", "en_reparacion", "listo"} {
		a.req(staff, "PATCH", orderPath+"/status", fmt.Sprintf(`{"status":%q}`, status), 200)
		current := a.obj(a.client(), "GET", publicPath, "", 200)
		if current["status"] != status {
			t.Fatal(current)
		}
		if status == "listo" && (current["estimated_ready_at"] != nil || current["completed_at"] == nil) {
			t.Fatal(current)
		}
	}
	// Customer messages can change after completion without editing service history.
	a.req(staff, "PUT", endpoint, `{"customer_update":"Podés retirar tu vehículo.","estimated_ready_at":null}`, 204)
	if current := a.obj(a.client(), "GET", publicPath, "", 200); current["customer_update"] != "Podés retirar tu vehículo." {
		t.Fatal(current)
	}
	rotated := a.obj(staff, "POST", endpoint+"/share", "", 201)
	newPath := "/api/v1/public/order-tracking/" + trackingToken(t, rotated)
	a.req(a.client(), "GET", publicPath, "", 404)
	a.req(a.client(), "GET", newPath, "", 200)
	a.req(staff, "DELETE", endpoint+"/share", "", 204)
	a.req(a.client(), "GET", newPath, "", 404)
	if meta := a.obj(staff, "GET", endpoint, "", 200); meta["share"] != nil {
		t.Fatal(meta)
	}
}

func TestOrderTrackingBranchPermissionsAndValidation(t *testing.T) {
	a := newTestAPI(t)
	admin := a.client()
	base, workshop, north, _ := a.workshop(admin)
	south := a.branch(workshop)
	vehicle := a.obj(admin, "POST", base+"/vehicles", `{"make":"Toyota","model":"Yaris","customer":{"full_name":"Cliente","phone":"7100-0002"}}`, 201)["id"].(string)
	order := a.obj(admin, "POST", base+"/work-orders", fmt.Sprintf(`{"vehicle_id":%q,"branch_id":%q,"reason":"Revisión"}`, vehicle, north), 201)["id"].(string)
	endpoint := base + "/work-orders/" + order + "/tracking"
	mechanic, otherBranch, reception := a.client(), a.client(), a.client()
	a.member(mechanic, workshop, north, sqlc.MembershipRoleMecanico)
	a.member(otherBranch, workshop, south, sqlc.MembershipRoleRecepcion)
	a.member(reception, workshop, north, sqlc.MembershipRoleRecepcion)
	valid := `{"customer_update":"Actualización pública","estimated_ready_at":null}`
	a.req(mechanic, "GET", endpoint, "", 200)
	for _, access := range []struct {
		client                  *http.Client
		readStatus, writeStatus int
	}{
		{mechanic, 200, 403}, {otherBranch, 404, 404}, {a.client(), 401, 401},
	} {
		a.req(access.client, "GET", endpoint, "", access.readStatus)
		a.req(access.client, "PUT", endpoint, valid, access.writeStatus)
		a.req(access.client, "POST", endpoint+"/share", "", access.writeStatus)
		a.req(access.client, "DELETE", endpoint+"/share", "", access.writeStatus)
	}

	// Writing another branch does not grant write access in a mechanic branch.
	user := mustUser(t, a, otherBranch)
	if _, err := a.q.CreateMembership(context.Background(), sqlc.CreateMembershipParams{UserID: user, WorkshopID: workshop, BranchID: north, Role: sqlc.MembershipRoleMecanico}); err != nil {
		t.Fatal(err)
	}
	a.req(otherBranch, "GET", endpoint, "", 200)
	a.req(otherBranch, "PUT", endpoint, valid, 403)
	a.req(reception, "PUT", endpoint, valid, 204)
	a.req(reception, "POST", endpoint+"/share", "", 201)
	a.req(reception, "DELETE", endpoint+"/share", "", 204)
	for _, body := range []string{`{}`, `{"customer_update":"missing date"}`, `{"customer_update":null,"estimated_ready_at":123}`, `{"customer_update":null,"estimated_ready_at":"2026-11-13T10:00"}`, `{"customer_update":null,"estimated_ready_at":"2020-01-01T00:00:00Z"}`, `{"customer_update":null,"estimated_ready_at":null,"internal_notes":"no"}`, fmt.Sprintf(`{"customer_update":%q,"estimated_ready_at":null}`, strings.Repeat("á", 1001))} {
		a.req(admin, "PUT", endpoint, body, 400)
	}
	a.req(admin, "PUT", endpoint, `{"customer_update":null,"estimated_ready_at":null}`, 204)
	other := a.client()
	otherBase, _, _, _ := a.workshop(other)
	a.req(other, "GET", otherBase+"/work-orders/"+order+"/tracking", "", 404)
	a.req(other, "POST", otherBase+"/work-orders/"+order+"/tracking/share", "", 404)
}

func TestOrderTrackingExpiryCancellationAndPublicReadOnly(t *testing.T) {
	a := newTestAPI(t)
	staff := a.client()
	base, _, branch, _ := a.workshop(staff)
	vehicle := a.obj(staff, "POST", base+"/vehicles", `{"make":"Kia","model":"Rio","customer":{"full_name":"Cliente","phone":"7100-0002"}}`, 201)["id"].(string)
	order := a.obj(staff, "POST", base+"/work-orders", fmt.Sprintf(`{"vehicle_id":%q,"branch_id":%q,"reason":"Ingreso"}`, vehicle, branch), 201)["id"].(string)
	orderPath := base + "/work-orders/" + order
	endpoint := orderPath + "/tracking"
	share := a.obj(staff, "POST", endpoint+"/share", "", 201)
	token := trackingToken(t, share)
	public := "/api/v1/public/order-tracking/" + token
	a.req(staff, "PATCH", orderPath+"/status", `{"status":"cancelado","cancel_reason":"secret-cancellation"}`, 200)
	current := a.obj(a.client(), "GET", public, "", 200)
	if current["status"] != "cancelado" || current["cancelled_at"] == nil || current["completed_at"] != nil || current["estimated_ready_at"] != nil {
		t.Fatal(current)
	}
	if strings.Contains(string(a.raw(a.client(), "GET", public, "", 200)), "secret-cancellation") {
		t.Fatal("cancel reason leaked")
	}
	eta := time.Now().Add(time.Hour).UTC().Format(time.RFC3339)
	a.req(staff, "PUT", endpoint, fmt.Sprintf(`{"customer_update":"no","estimated_ready_at":%q}`, eta), 400)
	for _, method := range []string{"POST", "PUT", "PATCH", "DELETE"} {
		a.req(a.client(), method, public, "{}", 405)
	}
	if _, err := a.db.Exec(context.Background(), `UPDATE work_order_tracking_share SET shared_at=now()-interval '31 days', expires_at=now()-interval '1 second' WHERE work_order_id=$1`, order); err != nil {
		t.Fatal(err)
	}
	a.req(a.client(), "GET", public, "", 404)
	if settings := a.obj(staff, "GET", endpoint, "", 200); settings["share"] != nil {
		t.Fatal(settings)
	}
	for _, token := range []string{"short", strings.Repeat("x", 43), uuid.NewString()} {
		a.req(a.client(), "GET", "/api/v1/public/order-tracking/"+token, "", 404)
	}
}

func TestConcurrentOrderTrackingSharesKeepOnlyOneLink(t *testing.T) {
	a := newTestAPI(t)
	staff := a.client()
	base, _, branch, _ := a.workshop(staff)
	vehicle := a.obj(staff, "POST", base+"/vehicles", `{"make":"Toyota","model":"Yaris","customer":{"full_name":"Cliente","phone":"7100-0002"}}`, 201)["id"].(string)
	order := a.obj(staff, "POST", base+"/work-orders", fmt.Sprintf(`{"vehicle_id":%q,"branch_id":%q,"reason":"Revisión"}`, vehicle, branch), 201)["id"].(string)
	endpoint := base + "/work-orders/" + order + "/tracking/share"
	var wg sync.WaitGroup
	start := make(chan struct{})
	links := make(chan string, 2)
	errors := make(chan error, 2)
	for range 2 {
		wg.Go(func() {
			<-start
			req, err := http.NewRequest("POST", a.srv.URL+endpoint, nil)
			if err != nil {
				errors <- err
				return
			}
			req.Header.Set("Origin", testOrigin)
			response, err := staff.Do(req)
			if err != nil {
				errors <- err
				return
			}
			defer response.Body.Close()
			data, _ := io.ReadAll(response.Body)
			if response.StatusCode != 201 {
				errors <- fmt.Errorf("share %d: %s", response.StatusCode, data)
				return
			}
			var result struct {
				URL string `json:"url"`
			}
			if err = json.Unmarshal(data, &result); err != nil {
				errors <- err
				return
			}
			_, token, _ := strings.Cut(result.URL, "/estado/")
			links <- token
		})
	}
	close(start)
	wg.Wait()
	close(links)
	close(errors)
	for err := range errors {
		t.Fatal(err)
	}
	valid := 0
	for token := range links {
		response, err := a.client().Get(a.srv.URL + "/api/v1/public/order-tracking/" + token)
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode == 200 {
			valid++
		} else if response.StatusCode != 404 {
			t.Fatal(response.StatusCode)
		}
	}
	if valid != 1 {
		t.Fatalf("valid tracking links: %d", valid)
	}
}
