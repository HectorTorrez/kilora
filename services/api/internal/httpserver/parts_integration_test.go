package httpserver

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
)

// La pieza elegida viaja del trabajo y de la cotización hasta lo que ve el
// cliente: la cotización pública (con el tipo de vehículo) y el historial.
func TestPartKeysFlow(t *testing.T) {
	api := newTestAPI(t)
	req := api.req
	a := api.client()
	req(a, "POST", "/api/v1/auth/register", fmt.Sprintf(`{"email":%q,"password":"password123","full_name":"Prueba"}`, uuid.NewString()+"@example.com"), 201)
	work := req(a, "POST", "/api/v1/workshops", `{"name":"Taller","branch_name":"Principal"}`, 201).(map[string]any)
	pa, branch := "/api/v1/workshops/"+work["id"].(string), work["branch_id"].(string)
	vid := req(a, "POST", pa+"/vehicles", `{"make":"Toyota","model":"Hilux","customer":{"full_name":"Ana López","phone":"7777-8888"}}`, 201).(map[string]any)["id"].(string)
	op := pa + "/work-orders/" + req(a, "POST", pa+"/work-orders", fmt.Sprintf(`{"vehicle_id":%q,"branch_id":%q,"reason":"Frenos"}`, vid, branch), 201).(map[string]any)["id"].(string)

	job := req(a, "POST", op+"/jobs", `{"description":"Pastillas","labor_price":"20","part":"pastillas_delanteras"}`, 201).(map[string]any)
	if job["part"] != "pastillas_delanteras" || job["category"] != "frenos" {
		t.Fatalf("trabajo con pieza: %v", job)
	}
	req(a, "POST", op+"/jobs", `{"description":"x","part":"turbo"}`, 400)

	req(a, "PUT", op+"/quote", `{"items":[{"kind":"repuesto","description":"x","quantity":"1","unit_price":"1","part":"nada"}]}`, 400)
	saved := req(a, "PUT", op+"/quote", `{"items":[{"kind":"repuesto","description":"Pastillas","quantity":"1","unit_price":"45","part":"pastillas_traseras"},{"kind":"mano_de_obra","description":"Revisión","quantity":"1","unit_price":"10"}]}`, 200).(map[string]any)
	items := saved["items"].([]any)
	if items[0].(map[string]any)["part"] != "pastillas_traseras" || items[1].(map[string]any)["part"] != nil {
		t.Fatalf("ítems con pieza: %v", items)
	}
	share := req(a, "POST", op+"/quote/share", "", 200).(map[string]any)
	token := strings.Split(share["url"].(string), "/c/")[1]
	public := req(&http.Client{}, "GET", "/api/v1/public/quotes/"+token, "", 200).(map[string]any)
	if public["items"].([]any)[0].(map[string]any)["part"] != "pastillas_traseras" {
		t.Fatalf("cotización pública sin pieza: %v", public["items"])
	}
	if _, ok := public["body_type"]; !ok {
		t.Fatal("la cotización pública debe incluir body_type")
	}
}
