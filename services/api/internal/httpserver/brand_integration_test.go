package httpserver

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
)

func TestQuoteBrandsRoundTrip(t *testing.T) {
	api := newTestAPI(t)
	admin := api.client()
	path, _, branch, _ := api.workshop(admin)
	body := func(brand string) string {
		return fmt.Sprintf(`{"customer_name":"Ana","vehicle_model":"Corolla","branch_id":%q,"items":[{"kind":"repuesto","description":"Filtro","brand":%q,"quantity":"1","unit_price":"10.00"},{"kind":"mano_de_obra","description":"Instalación","quantity":"1","unit_price":"5.00"}]}`, branch, brand)
	}
	check := func(quote map[string]any, want string) {
		t.Helper()
		items := quote["items"].([]any)
		if items[0].(map[string]any)["brand"] != want || items[1].(map[string]any)["brand"] != nil {
			t.Fatalf("marcas inesperadas: %v", items)
		}
		if quote["total"] != "15.00" {
			t.Fatalf("total alterado: %v", quote)
		}
	}
	created := api.obj(admin, "POST", path+"/quotes", body(" Bosch "), 201)
	check(created, "Bosch")
	qp := path + "/quotes/" + created["id"].(string)
	check(api.obj(admin, "GET", qp, "", 200), "Bosch")
	check(api.obj(admin, "PUT", qp, body("Mann"), 200), "Mann")
	share := api.obj(admin, "POST", qp+"/share", "", 200)
	token := strings.Split(share["url"].(string), "/c/")[1]
	check(api.obj(&http.Client{}, "GET", "/api/v1/public/quotes/"+token, "", 200), "Mann")
	api.req(admin, "PUT", qp, body(strings.Repeat("a", 101)), 400)
	cleared := api.obj(admin, "PUT", qp, body(" "), 200)
	if cleared["items"].([]any)[0].(map[string]any)["brand"] != nil {
		t.Fatalf("marca vacía debe quedar sin registrar: %v", cleared)
	}
}

func TestManualHistoryBrandReachesExplanationAndCorrections(t *testing.T) {
	api, fake := newAITestAPI(t, func(string) any {
		return map[string]any{"explanation": "Se cambió el filtro registrado."}
	})
	owner := api.client()
	api.register(owner)
	v := api.obj(owner, "POST", "/api/v1/me/vehicles", `{"make":"Toyota","model":"Corolla"}`, 201)
	vp := "/api/v1/me/vehicles/" + v["id"].(string)
	record := api.obj(owner, "POST", vp+"/history", `{"performed_on":"2024-01-10","summary":"Cambio de filtro","items":[{"kind":"pieza","description":"Filtro","brand":"Bosch","price":"10.00"},{"kind":"trabajo","description":"Cambio"}]}`, 201)
	api.req(owner, "POST", vp+"/history/"+record["id"].(string)+"/ai/explain", "", 200)
	assertBrand := func(want string) {
		t.Helper()
		var request struct {
			Messages []struct {
				Role    string          `json:"role"`
				Content json.RawMessage `json:"content"`
			} `json:"messages"`
		}
		if err := json.Unmarshal([]byte(fake.last()), &request); err != nil {
			t.Fatal(err)
		}
		var data string
		for _, message := range request.Messages {
			if message.Role == "system" {
				var text string
				if err := json.Unmarshal(message.Content, &text); err != nil {
					t.Fatal(err)
				}
				data += text
			} else {
				var parts []struct {
					Text string `json:"text"`
				}
				if err := json.Unmarshal(message.Content, &parts); err != nil {
					t.Fatal(err)
				}
				for _, part := range parts {
					data += part.Text
				}
			}
		}
		if !strings.Contains(data, `"brand":"`+want+`"`) || !strings.Contains(data, "no la supongas") {
			t.Fatalf("falta marca registrada o instrucción contra suposiciones: %s", data)
		}
	}
	assertBrand("Bosch")
	api.req(owner, "POST", vp+"/corrections", fmt.Sprintf(`{"history_record_id":%q,"reason":"Marca corregida","changes":{"items":[{"kind":"pieza","description":"Filtro","brand":"Mann","price":"10.00"}]}}`, record["id"]), 201)
	api.req(owner, "POST", vp+"/history/"+record["id"].(string)+"/ai/explain", "", 200)
	assertBrand("Mann")
	api.req(owner, "POST", vp+"/history", `{"performed_on":"2024-01-10","summary":"Filtro","items":[{"kind":"pieza","description":"Filtro","brand":"`+strings.Repeat("a", 101)+`"}]}`, 400)
}
