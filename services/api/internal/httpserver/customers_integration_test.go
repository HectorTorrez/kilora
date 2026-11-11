package httpserver

import (
	"fmt"
	"testing"

	"kilora/api/internal/database/sqlc"
)

func TestCustomersOwnVehicles(t *testing.T) {
	a := newTestAPI(t)
	c := a.client()
	path, workshop, branch, _ := a.workshop(c)

	missing := a.obj(c, "POST", path+"/vehicles", `{"make":"Toyota","model":"Yaris"}`, 400)
	if missing["error"] != customerRequired {
		t.Fatal(missing)
	}
	a.req(c, "POST", path+"/vehicles", `{"make":"Toyota","model":"Yaris","customer":{"full_name":"Ana López","phone":""}}`, 400)
	a.req(c, "POST", path+"/vehicles", `{"make":"Toyota","model":"Yaris","customer":{"full_name":"4","phone":"7777-8888"}}`, 400)

	first := a.obj(c, "POST", path+"/vehicles", `{"make":"Toyota","model":"Yaris","plate":"P100","customer":{"full_name":"  Ana   López ","phone":"7777-8888","email":"ANA@example.com"}}`, 201)
	ana := first["customer"].(map[string]any)
	if ana["full_name"] != "Ana López" || ana["phone"] != "+50377778888" || ana["email"] != "ana@example.com" {
		t.Fatal(ana)
	}
	anaID := ana["id"].(string)

	dup := a.obj(c, "POST", path+"/vehicles", `{"make":"Kia","model":"Rio","customer":{"full_name":"Otra Persona","phone":"+503 7777 8888"}}`, 409)
	if dup["error"] != "Ya existe un cliente con ese teléfono: Ana López" {
		t.Fatal(dup)
	}
	second := a.obj(c, "POST", path+"/vehicles", fmt.Sprintf(`{"make":"Kia","model":"Rio","plate":"P200","customer_id":%q}`, anaID), 201)
	if second["customer"].(map[string]any)["id"] != anaID {
		t.Fatal(second)
	}

	luis := a.obj(c, "POST", path+"/customers", `{"full_name":"Luis Pérez","phone":"7111-2222"}`, 201)
	luisID := luis["id"].(string)
	a.req(c, "POST", path+"/customers", `{"full_name":"Luis Repetido","phone":"71112222"}`, 409)

	detail := a.obj(c, "GET", path+"/customers/"+anaID, "", 200)
	if vehicles := detail["vehicles"].([]any); len(vehicles) != 2 {
		t.Fatal(detail)
	}

	page := a.obj(c, "GET", path+"/customers/page?q=7777-8888", "", 200)
	items := page["items"].([]any)
	if page["total"].(float64) != 1 || len(items) != 1 || items[0].(map[string]any)["vehicle_count"].(float64) != 2 {
		t.Fatal(page)
	}
	if byName := a.obj(c, "GET", path+"/customers/page?q=lópez", "", 200); byName["total"].(float64) != 1 {
		t.Fatal(byName)
	}
	if vehicles := a.obj(c, "GET", path+"/vehicles/page?q=luis", "", 200); vehicles["total"].(float64) != 0 {
		t.Fatal(vehicles)
	}

	vehicleID := second["id"].(string)
	a.req(c, "PUT", path+"/vehicles/"+vehicleID+"/customer", `{}`, 400)
	a.req(c, "PUT", path+"/vehicles/"+vehicleID+"/customer", fmt.Sprintf(`{"customer_id":%q}`, luisID), 200)
	moved := a.obj(c, "GET", path+"/vehicles/"+vehicleID, "", 200)
	if moved["customer"].(map[string]any)["full_name"] != "Luis Pérez" {
		t.Fatal(moved)
	}
	if vehicles := a.obj(c, "GET", path+"/vehicles/page?q=luis", "", 200); vehicles["total"].(float64) != 1 {
		t.Fatal(vehicles)
	}

	a.req(c, "PATCH", path+"/customers/"+luisID, `{"full_name":"Luis Pérez","phone":"7777-8888"}`, 409)
	edited := a.obj(c, "PATCH", path+"/customers/"+luisID, `{"full_name":"Luis Alberto Pérez","phone":"7111-2222","email":"luis@example.com"}`, 200)
	if edited["full_name"] != "Luis Alberto Pérez" || edited["email"] != "luis@example.com" {
		t.Fatal(edited)
	}

	mechanic := a.client()
	a.register(mechanic)
	a.member(mechanic, workshop, branch, sqlc.MembershipRoleMecanico)
	a.req(mechanic, "GET", path+"/customers/"+anaID, "", 200)
	a.req(mechanic, "POST", path+"/customers", `{"full_name":"Nadie","phone":"7000-1234"}`, 403)
	a.req(mechanic, "PATCH", path+"/customers/"+anaID, `{"full_name":"Nadie","phone":"7000-1234"}`, 403)
	a.req(mechanic, "PUT", path+"/vehicles/"+vehicleID+"/customer", fmt.Sprintf(`{"customer_id":%q}`, anaID), 403)

	var audits int
	if err := a.db.QueryRow(t.Context(), "SELECT count(*) FROM audit_event WHERE workshop_id = $1 AND entity = 'customer'", workshop).Scan(&audits); err != nil || audits != 3 {
		t.Fatal(audits, err)
	}
}

func TestCounterQuoteConversionUsesCustomer(t *testing.T) {
	a := newTestAPI(t)
	c := a.client()
	path, _, branch, _ := a.workshop(c)
	items := `"items":[{"kind":"mano_de_obra","description":"Diagnóstico","quantity":"1","unit_price":"15.00"}]`

	existing := a.obj(c, "POST", path+"/customers", `{"full_name":"Marta Ruiz","phone":"7222-3333"}`, 201)["id"].(string)

	noPhone := a.obj(c, "POST", path+"/quotes", fmt.Sprintf(`{"customer_name":"Sin Teléfono","vehicle_model":"Yaris","branch_id":%q,%s}`, branch, items), 201)["id"].(string)
	a.req(c, "POST", path+"/quotes/"+noPhone+"/convert", "", 400)

	byPhone := a.obj(c, "POST", path+"/quotes", fmt.Sprintf(`{"customer_name":"Marta R.","customer_phone":"72223333","vehicle_model":"Yaris","branch_id":%q,%s}`, branch, items), 201)["id"].(string)
	order := a.obj(c, "POST", path+"/quotes/"+byPhone+"/convert", "", 200)
	vehicle := a.obj(c, "GET", path+"/work-orders/"+order["order_id"].(string), "", 200)["vehicle_id"].(string)
	if got := a.obj(c, "GET", path+"/vehicles/"+vehicle, "", 200)["customer"].(map[string]any)["id"]; got != existing {
		t.Fatalf("la conversión no reutilizó el cliente: %v", got)
	}

	picked := a.obj(c, "POST", path+"/quotes", fmt.Sprintf(`{"customer_id":%q,"vehicle_model":"Civic","branch_id":%q,%s}`, existing, branch, items), 201)
	if picked["customer_name"] != "Marta Ruiz" || picked["customer_phone"] != "+50372223333" || picked["customer_id"] != existing {
		t.Fatal(picked)
	}

	fresh := a.obj(c, "POST", path+"/quotes", fmt.Sprintf(`{"customer_name":"Pedro Gómez","customer_phone":"7333-4444","vehicle_model":"Rio","branch_id":%q,%s}`, branch, items), 201)["id"].(string)
	order = a.obj(c, "POST", path+"/quotes/"+fresh+"/convert", "", 200)
	vehicle = a.obj(c, "GET", path+"/work-orders/"+order["order_id"].(string), "", 200)["vehicle_id"].(string)
	if got := a.obj(c, "GET", path+"/vehicles/"+vehicle, "", 200)["customer"].(map[string]any); got["full_name"] != "Pedro Gómez" || got["phone"] != "+50373334444" {
		t.Fatal(got)
	}
}
