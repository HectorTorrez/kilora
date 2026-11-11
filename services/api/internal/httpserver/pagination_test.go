package httpserver

import (
	"context"
	"fmt"
	"net/http/httptest"
	"testing"
	"time"

	"kilora/api/internal/database/sqlc"
)

func TestPageWindow(t *testing.T) {
	for _, query := range []string{"limit=0", "limit=101", "limit=x", "offset=-1", "offset=2147483648", "offset=4294967296", "offset=x"} {
		t.Run(query, func(t *testing.T) {
			if _, _, err := pageWindow(httptest.NewRequest("GET", "/?"+query, nil)); err == nil {
				t.Fatal("expected invalid pagination to fail")
			}
		})
	}
	limit, offset, err := pageWindow(httptest.NewRequest("GET", "/?limit=25&offset=25", nil))
	if err != nil || limit != 25 || offset != 25 {
		t.Fatalf("unexpected window: %d %d %v", limit, offset, err)
	}
}

func TestPaginatedLists(t *testing.T) {
	a := newTestAPI(t)
	c := a.client()
	path, workshop, branch, _ := a.workshop(c)
	var firstVehicle, firstOrder string
	for i := range 27 {
		vehicle := a.obj(c, "POST", path+"/vehicles", fmt.Sprintf(`{"make":"Toyota","model":"Modelo %02d","customer":{"full_name":"Cliente","phone":"7200%04d"}}`, i, i), 201)["id"].(string)
		order := a.obj(c, "POST", path+"/work-orders", fmt.Sprintf(`{"vehicle_id":%q,"branch_id":%q,"reason":"Revisión %02d","odometer_km":100}`, vehicle, branch, i), 201)["id"].(string)
		a.obj(c, "POST", path+"/quotes", fmt.Sprintf(`{"customer_name":"Cliente %02d","vehicle_model":"Yaris","branch_id":%q,"items":[{"kind":"mano_de_obra","description":"Revisión","quantity":"1","unit_price":"15.00"}]}`, i, branch), 201)
		if i == 0 {
			firstVehicle, firstOrder = vehicle, order
		}
	}
	a.req(c, "PATCH", path+"/work-orders/"+firstOrder+"/status", `{"status":"diagnostico"}`, 200)
	if _, err := a.db.Exec(context.Background(), "UPDATE work_order SET received_at = '2026-01-01' WHERE workshop_id = $1", workshop); err != nil {
		t.Fatal(err)
	}
	if _, err := a.db.Exec(context.Background(), "UPDATE vehicle SET last_activity_at = '2026-01-01' WHERE created_by_workshop_id = $1", workshop); err != nil {
		t.Fatal(err)
	}

	for _, resource := range []string{"/vehicles/page", "/work-orders/page", "/quotes"} {
		t.Run(resource, func(t *testing.T) {
			seen := map[string]bool{}
			for _, offset := range []int{0, 25} {
				result := a.obj(c, "GET", fmt.Sprintf("%s%s?limit=25&offset=%d", path, resource, offset), "", 200)
				items := result["items"].([]any)
				want := 25
				if offset == 25 {
					want = 2
				}
				if len(items) != want || result["total"].(float64) != 27 {
					t.Fatalf("unexpected page: %v", result)
				}
				for _, item := range items {
					row := item.(map[string]any)
					id := row["id"].(string)
					if seen[id] {
						t.Fatalf("duplicate across pages: %s", id)
					}
					seen[id] = true
					if resource == "/vehicles/page" && row["last_odometer_km"] != float64(100) {
						t.Fatalf("missing odometer: %v", row)
					}
				}
			}
			if len(seen) != 27 {
				t.Fatal("missing records")
			}
			beyond := a.obj(c, "GET", path+resource+"?limit=25&offset=100", "", 200)
			if len(beyond["items"].([]any)) != 0 || beyond["total"].(float64) != 27 {
				t.Fatalf("lost total on empty page: %v", beyond)
			}
			empty := a.obj(c, "GET", path+resource+"?q=nonexistent", "", 200)
			if len(empty["items"].([]any)) != 0 || empty["total"].(float64) != 0 {
				t.Fatal(empty)
			}
			escaped := a.obj(c, "GET", path+resource+"?q=%25", "", 200)
			if escaped["total"].(float64) != 0 {
				t.Fatal("search wildcard not escaped", escaped)
			}
			for _, query := range []string{"limit=0", "limit=101", "offset=-1", "offset=2147483648"} {
				a.req(c, "GET", path+resource+"?"+query, "", 400)
			}
		})
	}

	filtered := a.obj(c, "GET", path+"/work-orders/page?status=diagnostico&limit=1", "", 200)
	counts := filtered["counts"].(map[string]any)
	if filtered["total"].(float64) != 1 || counts["recibido"].(float64) != 26 || counts[""].(float64) != 27 {
		t.Fatal(filtered)
	}
	for _, query := range []string{"status=diagnostico&status=recibido", "status=diagnostico,recibido"} {
		several := a.obj(c, "GET", path+"/work-orders/page?"+query+"&limit=5", "", 200)
		if several["total"].(float64) != 27 || len(several["items"].([]any)) != 5 {
			t.Fatal(query, several)
		}
	}
	if none := a.obj(c, "GET", path+"/work-orders/page?status=listo,cancelado", "", 200); none["total"].(float64) != 0 || len(none["items"].([]any)) != 0 {
		t.Fatal(none)
	}
	a.req(c, "GET", path+"/work-orders/page?status=diagnostico,unknown", "", 400)
	// Una orden a las 03:00 UTC del 2 de enero sigue siendo 1 de enero en El
	// Salvador: el filtro tiene que usar la fecha local, no la UTC.
	if _, err := a.db.Exec(context.Background(), "UPDATE work_order SET received_at = '2026-01-02 03:00:00+00' WHERE id = $1", firstOrder); err != nil {
		t.Fatal(err)
	}
	sv, _ := time.LoadLocation("America/El_Salvador")
	today := time.Now().In(sv).Format(time.DateOnly)
	for resource, day := range map[string]string{"/work-orders/page": "2026-01-01", "/vehicles/page": "2026-01-01", "/quotes": today} {
		inRange := a.obj(c, "GET", path+resource+"?from="+day+"&to="+day, "", 200)
		all := a.obj(c, "GET", path+resource, "", 200)
		if inRange["total"] != all["total"] || inRange["total"].(float64) == 0 {
			t.Fatal(resource, inRange["total"], all["total"])
		}
		past := a.obj(c, "GET", path+resource+"?from=2000-01-01&to=2000-12-31", "", 200)
		if past["total"].(float64) != 0 || past["counts"].(map[string]any)[""].(float64) != 0 {
			t.Fatal(resource, past)
		}
		a.req(c, "GET", path+resource+"?from=2026-02-30", "", 400)
		a.req(c, "GET", path+resource+"?from=2026-05-02&to=2026-05-01", "", 400)
	}
	if next := a.obj(c, "GET", path+"/work-orders/page?from=2026-01-02", "", 200); next["total"].(float64) != 0 {
		t.Fatal("la fecha se comparó en UTC", next)
	}
	searched := a.obj(c, "GET", path+"/work-orders/page?q=Modelo%2000", "", 200)
	if searched["total"].(float64) != 1 || searched["items"].([]any)[0].(map[string]any)["id"] != firstOrder {
		t.Fatal(searched)
	}
	vehicleSearch := a.obj(c, "GET", path+"/vehicles/page?q=mo-delo%2000&status=provisional", "", 200)
	if vehicleSearch["total"].(float64) != 1 || vehicleSearch["items"].([]any)[0].(map[string]any)["id"] != firstVehicle {
		t.Fatal(vehicleSearch)
	}
	quoteSearch := a.obj(c, "GET", path+"/quotes?q=Cliente%2000", "", 200)
	if quoteSearch["total"].(float64) != 1 {
		t.Fatal(quoteSearch)
	}
	a.req(c, "GET", path+"/vehicles/page?status=unknown", "", 400)
	a.req(c, "GET", path+"/work-orders/page?status=unknown", "", 400)
	a.req(c, "GET", path+"/work-orders/page?branch_id=invalid", "", 400)

	other := a.client()
	otherPath, _, _, _ := a.workshop(other)
	for _, resource := range []string{"/vehicles/page", "/work-orders/page"} {
		a.req(other, "GET", path+resource, "", 403)
		result := a.obj(other, "GET", otherPath+resource, "", 200)
		if result["total"].(float64) != 0 || len(result["items"].([]any)) != 0 {
			t.Fatal("cross-workshop leak", result)
		}
	}

	south := a.branch(workshop)
	if _, err := a.db.Exec(context.Background(), "UPDATE work_order SET branch_id = $1 WHERE id = $2", south, firstOrder); err != nil {
		t.Fatal(err)
	}
	mechanic := a.client()
	a.member(mechanic, workshop, branch, sqlc.MembershipRoleMecanico)
	visible := a.obj(mechanic, "GET", path+"/work-orders/page", "", 200)
	if visible["total"].(float64) != 26 || visible["counts"].(map[string]any)[""].(float64) != 26 {
		t.Fatal("branch counts leaked", visible)
	}
	hidden := a.obj(mechanic, "GET", path+"/work-orders/page?branch_id="+south.String(), "", 200)
	if hidden["total"].(float64) != 0 {
		t.Fatal("branch filter bypassed access", hidden)
	}
}

func TestAuditPagination(t *testing.T) {
	a := newTestAPI(t)
	admin := a.client()
	path, workshop, branch, _ := a.workshop(admin)
	baseline := a.obj(admin, "GET", path+"/audit/page", "", 200)["total"].(float64)
	customer := a.obj(admin, "POST", path+"/customers", `{"full_name":"Cliente Admin","phone":"7100-0005"}`, 201)["id"].(string)
	for range 26 {
		a.obj(admin, "POST", path+"/vehicles", fmt.Sprintf(`{"make":"Toyota","model":"Yaris","customer_id":%q}`, customer), 201)
	}
	wantTotal := baseline + 27 // el cliente y los 26 vehículos
	seen := map[float64]bool{}
	var previous float64
	for _, offset := range []int{0, 25} {
		result := a.obj(admin, "GET", fmt.Sprintf("%s/audit/page?limit=25&offset=%d", path, offset), "", 200)
		items := result["items"].([]any)
		wantLength := 25
		if offset == 25 {
			wantLength = int(wantTotal) - 25
		}
		if len(items) != wantLength || result["total"].(float64) != wantTotal {
			t.Fatal("incorrect audit page", result)
		}
		for _, item := range items {
			event := item.(map[string]any)
			id := event["id"].(float64)
			if seen[id] || (previous != 0 && id >= previous) {
				t.Fatal("duplicate or out-of-order event", event)
			}
			seen[id] = true
			previous = id
			if event["actor_name"] == nil || event["created_at"] == nil {
				t.Fatal("missing event detail", event)
			}
		}
	}
	if len(seen) != int(wantTotal) {
		t.Fatal("missing audit events")
	}
	firstAgain := a.obj(admin, "GET", path+"/audit/page?limit=25", "", 200)
	if len(firstAgain["items"].([]any)) != 25 || firstAgain["total"].(float64) != wantTotal {
		t.Fatal("cannot return to first page", firstAgain)
	}
	beyond := a.obj(admin, "GET", path+"/audit/page?limit=25&offset=100", "", 200)
	if len(beyond["items"].([]any)) != 0 || beyond["total"].(float64) != wantTotal {
		t.Fatal("empty page lost total", beyond)
	}
	for _, query := range []string{"limit=0", "limit=101", "offset=-1", "offset=2147483648"} {
		a.req(admin, "GET", path+"/audit/page?"+query, "", 400)
	}
	mechanic := a.client()
	a.member(mechanic, workshop, branch, sqlc.MembershipRoleMecanico)
	a.req(mechanic, "GET", path+"/audit/page", "", 403)
	outsider := a.client()
	otherPath, _, _, _ := a.workshop(outsider)
	a.req(outsider, "GET", path+"/audit/page", "", 403)
	other := a.obj(outsider, "GET", otherPath+"/audit/page", "", 200)
	if other["total"].(float64) != baseline || len(other["items"].([]any)) != int(baseline) {
		t.Fatal("audit data leaked between workshops", other)
	}
}
