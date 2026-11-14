package httpserver

import (
	"fmt"
	"strings"
	"testing"

	"kilora/api/internal/database/sqlc"
)

func templateItems(t *testing.T, template map[string]any) []map[string]any {
	t.Helper()
	raw, ok := template["items"].([]any)
	if !ok {
		t.Fatal(template)
	}
	items := make([]map[string]any, len(raw))
	for i, v := range raw {
		items[i] = v.(map[string]any)
	}
	return items
}

func TestQuoteTemplateLifecycle(t *testing.T) {
	a := newTestAPI(t)
	staff := a.client()
	path, _, branch, _ := a.workshop(staff)
	endpoint := path + "/quote-templates"

	if list := a.obj(staff, "GET", endpoint, "", 200); len(list["items"].([]any)) != 0 {
		t.Fatal(list)
	}
	body := `{"name":"  Servicio 5,000 km  ","items":[
		{"kind":"repuesto","description":"Aceite 5W-30","quantity":"4","unit_price":"8.50","part":"aceite_motor","brand":"Mobil"},
		{"kind":"mano_de_obra","description":"Cambio de aceite","quantity":"1","unit_price":"15","brand":"ignored"}]}`
	created := a.obj(staff, "POST", endpoint, body, 201)
	id := created["id"].(string)
	items := templateItems(t, created)
	if created["name"] != "Servicio 5,000 km" || len(items) != 2 {
		t.Fatal(created)
	}
	if items[0]["description"] != "Aceite 5W-30" || items[0]["quantity"] != "4.00" || items[0]["unit_price"] != "8.50" || items[0]["part"] != "aceite_motor" || items[0]["brand"] != "Mobil" {
		t.Fatal(items[0])
	}
	if items[1]["kind"] != "mano_de_obra" || items[1]["brand"] != nil {
		t.Fatal(items[1])
	}

	// Names are unique per workshop regardless of case.
	a.req(staff, "POST", endpoint, `{"name":"servicio 5,000 KM","items":[{"kind":"mano_de_obra","description":"x","quantity":"1","unit_price":"1"}]}`, 409)
	a.obj(staff, "POST", endpoint, `{"name":"Frenos delanteros","items":[{"kind":"mano_de_obra","description":"Cambio de pastillas","quantity":"1","unit_price":"20"}]}`, 201)

	// A quote made from a template is a copy: editing the template later does not change it.
	vehicle := a.obj(staff, "POST", path+"/vehicles", `{"make":"Toyota","model":"Corolla","customer":{"full_name":"Cliente","phone":"7100-0003"}}`, 201)["id"].(string)
	order := a.obj(staff, "POST", path+"/work-orders", fmt.Sprintf(`{"vehicle_id":%q,"branch_id":%q,"reason":"Servicio"}`, vehicle, branch), 201)["id"].(string)
	a.req(staff, "PUT", path+"/work-orders/"+order+"/quote", `{"items":[{"kind":"repuesto","description":"Aceite 5W-30","quantity":"4","unit_price":"8.50"}]}`, 200)

	updated := a.obj(staff, "PUT", endpoint+"/"+id, `{"name":"Servicio 10,000 km","items":[{"kind":"mano_de_obra","description":"Revisión general","quantity":"1","unit_price":"30"}]}`, 200)
	if updated["name"] != "Servicio 10,000 km" || len(templateItems(t, updated)) != 1 {
		t.Fatal(updated)
	}
	quote := a.obj(staff, "GET", path+"/work-orders/"+order+"/quote", "", 200)
	if data := fmt.Sprint(quote); !strings.Contains(data, "Aceite 5W-30") || strings.Contains(data, "Revisión general") {
		t.Fatal(quote)
	}

	// Renaming onto another template's name conflicts.
	a.req(staff, "PUT", endpoint+"/"+id, `{"name":"FRENOS DELANTEROS","items":[{"kind":"mano_de_obra","description":"x","quantity":"1","unit_price":"1"}]}`, 409)

	list := a.obj(staff, "GET", endpoint, "", 200)["items"].([]any)
	if len(list) != 2 || list[0].(map[string]any)["name"] != "Frenos delanteros" || list[1].(map[string]any)["name"] != "Servicio 10,000 km" {
		t.Fatal(list)
	}

	a.req(staff, "DELETE", endpoint+"/"+id, "", 204)
	a.req(staff, "DELETE", endpoint+"/"+id, "", 404)
	a.req(staff, "PUT", endpoint+"/"+id, `{"name":"x","items":[{"kind":"mano_de_obra","description":"x","quantity":"1","unit_price":"1"}]}`, 404)
	if list := a.obj(staff, "GET", endpoint, "", 200)["items"].([]any); len(list) != 1 {
		t.Fatal(list)
	}
}

func TestQuoteTemplateValidation(t *testing.T) {
	a := newTestAPI(t)
	staff := a.client()
	path, _, _, _ := a.workshop(staff)
	endpoint := path + "/quote-templates"
	item := `{"kind":"mano_de_obra","description":"x","quantity":"1","unit_price":"1"}`
	for _, body := range []string{
		`{"name":"","items":[` + item + `]}`,
		`{"name":"   ","items":[` + item + `]}`,
		`{"name":"` + strings.Repeat("a", 101) + `","items":[` + item + `]}`,
		`{"name":"Sin ítems","items":[]}`,
		`{"name":"Cantidad","items":[{"kind":"repuesto","description":"x","quantity":"0","unit_price":"1"}]}`,
		`{"name":"Precio","items":[{"kind":"repuesto","description":"x","quantity":"1","unit_price":"-1"}]}`,
		`{"name":"Tipo","items":[{"kind":"otro","description":"x","quantity":"1","unit_price":"1"}]}`,
		`{"name":"Pieza","items":[{"kind":"repuesto","description":"x","quantity":"1","unit_price":"1","part":"no_existe"}]}`,
		`{"name":"Muchos","items":[` + strings.TrimSuffix(strings.Repeat(item+",", 101), ",") + `]}`,
	} {
		a.req(staff, "POST", endpoint, body, 400)
	}
	a.req(staff, "POST", endpoint, `{"name":"`+strings.Repeat("ñ", 100)+`","items":[`+strings.TrimSuffix(strings.Repeat(item+",", 100), ",")+`]}`, 201)
	a.req(staff, "PUT", endpoint+"/not-a-uuid", `{"name":"x","items":[`+item+`]}`, 404)
}

func TestQuoteTemplateAccess(t *testing.T) {
	a := newTestAPI(t)
	admin := a.client()
	base, workshop, north, _ := a.workshop(admin)
	south := a.branch(workshop)
	endpoint := base + "/quote-templates"
	valid := `{"name":"Alineación","items":[{"kind":"mano_de_obra","description":"Alineación","quantity":"1","unit_price":"25"}]}`
	template := a.obj(admin, "POST", endpoint, valid, 201)["id"].(string)
	item := endpoint + "/" + template

	mechanic, reception, southReception := a.client(), a.client(), a.client()
	a.member(mechanic, workshop, north, sqlc.MembershipRoleMecanico)
	a.member(reception, workshop, north, sqlc.MembershipRoleRecepcion)
	a.member(southReception, workshop, south, sqlc.MembershipRoleRecepcion)

	// Templates belong to the whole workshop: anyone in it can read them,
	// writers of any branch can manage them, mechanics only use them.
	for _, c := range []struct {
		name string
		do   func()
	}{
		{"mechanic", func() {
			if list := a.obj(mechanic, "GET", endpoint, "", 200)["items"].([]any); len(list) != 1 {
				t.Fatal(list)
			}
			a.req(mechanic, "POST", endpoint, `{"name":"Mecánico","items":[{"kind":"mano_de_obra","description":"x","quantity":"1","unit_price":"1"}]}`, 403)
			a.req(mechanic, "PUT", item, valid, 403)
			a.req(mechanic, "DELETE", item, "", 403)
		}},
		{"reception", func() {
			a.req(reception, "PUT", item, `{"name":"Alineación y balanceo","items":[{"kind":"mano_de_obra","description":"Alineación","quantity":"1","unit_price":"30"}]}`, 200)
		}},
		{"other branch reception", func() {
			a.obj(southReception, "POST", endpoint, `{"name":"Sur","items":[{"kind":"mano_de_obra","description":"x","quantity":"1","unit_price":"1"}]}`, 201)
		}},
		{"anonymous", func() {
			a.req(a.client(), "GET", endpoint, "", 401)
			a.req(a.client(), "POST", endpoint, valid, 401)
		}},
	} {
		t.Run(c.name, func(t *testing.T) { c.do() })
	}

	// Another workshop can neither see nor touch these templates.
	outsider := a.client()
	otherBase, _, _, _ := a.workshop(outsider)
	if list := a.obj(outsider, "GET", otherBase+"/quote-templates", "", 200)["items"].([]any); len(list) != 0 {
		t.Fatal(list)
	}
	a.req(outsider, "PUT", otherBase+"/quote-templates/"+template, valid, 404)
	a.req(outsider, "DELETE", otherBase+"/quote-templates/"+template, "", 404)
	a.req(outsider, "GET", endpoint, "", 403)
	if list := a.obj(admin, "GET", endpoint, "", 200)["items"].([]any); len(list) != 2 {
		t.Fatal(list)
	}
}
