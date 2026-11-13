package httpserver

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"
)

func TestCounterQuotes(t *testing.T) {
	api := newTestAPI(t)
	db := api.db
	client, req := api.client, api.req
	setup := func(c *http.Client) (string, string) {
		t.Helper()
		api.register(c)
		work := req(c, "POST", "/api/v1/workshops", `{"name":"Taller","branch_name":"Principal"}`, 201).(map[string]any)
		return "/api/v1/workshops/" + work["id"].(string), work["branch_id"].(string)
	}
	a, b := client(), client()
	pa, ba := setup(a)
	pb, _ := setup(b)
	body := fmt.Sprintf(`{"customer_name":"Ana López","customer_phone":"7777-8888","vehicle_make":"Honda","vehicle_model":"Civic","vehicle_year":2017,"vehicle_plate":"p-123","branch_id":%q,"notes":"Precios de mostrador","items":[{"kind":"repuesto","description":"Filtro","quantity":"2","unit_price":"10.25"},{"kind":"mano_de_obra","description":"Instalación","quantity":"1","unit_price":"5.00"}]}`, ba)
	created := req(a, "POST", pa+"/quotes", body, 201).(map[string]any)
	quoteID := created["id"].(string)
	if created["number"].(float64) != 1 || created["vehicle_plate"] != "P123" || created["customer_phone"] != "+50377778888" || created["total"] != "25.50" || created["outcome"] != "pendiente" {
		t.Fatal(created)
	}
	list := req(a, "GET", pa+"/quotes?q=Ana", "", 200).(map[string]any)
	items := list["items"].([]any)
	if len(items) != 1 || items[0].(map[string]any)["id"] != quoteID {
		t.Fatal(list)
	}
	byCode := req(a, "GET", pa+"/quotes?q=COT-0001", "", 200).(map[string]any)
	if len(byCode["items"].([]any)) != 1 {
		t.Fatal(byCode)
	}
	editedBody := fmt.Sprintf(`{"customer_name":"Ana López","customer_phone":"+50377778888","vehicle_make":"Honda","vehicle_model":"Civic","vehicle_year":2017,"vehicle_plate":"P123","branch_id":%q,"notes":"Incluye instalación","valid_days":10,"items":[{"kind":"repuesto","description":"Filtro","quantity":"2","unit_price":"10.25"},{"kind":"mano_de_obra","description":"Instalación","quantity":"1","unit_price":"8.00"}]}`, ba)
	edited := req(a, "PUT", pa+"/quotes/"+quoteID, editedBody, 200).(map[string]any)
	if edited["notes"] != "Incluye instalación" || edited["total"] != "28.50" {
		t.Fatal(edited)
	}
	rejected := req(a, "PATCH", pa+"/quotes/"+quoteID+"/outcome", `{"outcome":"rechazo"}`, 200).(map[string]any)
	if rejected["outcome"] != "rechazo" {
		t.Fatal(rejected)
	}
	conflict := req(a, "PUT", pa+"/quotes/"+quoteID, editedBody, 409).(map[string]any)
	if conflict["error"] != "La cotización ya tiene resultado" {
		t.Fatal(conflict)
	}
	rejectedConvert := req(a, "POST", pa+"/quotes/"+quoteID+"/convert", "", 409).(map[string]any)
	if rejectedConvert["error"] != "La cotización fue rechazada" {
		t.Fatal(rejectedConvert)
	}
	share := req(a, "POST", pa+"/quotes/"+quoteID+"/share", "", 200).(map[string]any)
	token := strings.Split(share["url"].(string), "/c/")[1]
	public := req(&http.Client{}, "GET", "/api/v1/public/quotes/"+token, "", 200).(map[string]any)
	if public["order_number"] != nil || public["model"] != "Civic" || public["plate"] != "P123" || public["quote_number"].(float64) != 1 || public["customer_name"] != "Ana López" {
		t.Fatal(public)
	}
	secondBody := fmt.Sprintf(`{"customer_name":"Luis Pérez","customer_phone":"7111-2222","vehicle_make":"Toyota","vehicle_model":"Yaris","vehicle_plate":"p-999","branch_id":%q,"items":[{"kind":"mano_de_obra","description":"Diagnóstico","quantity":"1","unit_price":"15.00"}]}`, ba)
	second := req(a, "POST", pa+"/quotes", secondBody, 201).(map[string]any)
	secondID := second["id"].(string)
	if second["number"].(float64) != 2 {
		t.Fatal(second)
	}
	pending := req(a, "GET", pa+"/quotes?outcome=pendiente", "", 200).(map[string]any)
	if len(pending["items"].([]any)) != 1 || pending["total"].(float64) != 1 {
		t.Fatal(pending)
	}
	several := req(a, "GET", pa+"/quotes?outcome=pendiente&outcome=rechazo", "", 200).(map[string]any)
	if counts := several["counts"].(map[string]any); several["total"].(float64) != 2 || counts[""].(float64) != 2 || counts["pendiente"].(float64) != 1 {
		t.Fatal(several)
	}
	converted := req(a, "POST", pa+"/quotes/"+secondID+"/convert", "", 200).(map[string]any)
	orderID, _ := converted["order_id"].(string)
	if orderID == "" {
		t.Fatal(converted)
	}
	order := req(a, "GET", pa+"/work-orders/"+orderID, "", 200).(map[string]any)
	if order["reason"] != "Cotización COT-0002" || order["number"].(float64) != 1 {
		t.Fatal(order)
	}
	orderQuote := order["quote"].(map[string]any)
	if orderQuote["outcome"] != "acepto" || orderQuote["total"] != "15.00" {
		t.Fatal(orderQuote)
	}
	after := req(a, "GET", pa+"/quotes/"+secondID, "", 200).(map[string]any)
	if after["converted_order_id"] != orderID || after["converted_order_number"].(float64) != 1 || after["outcome"] != "acepto" {
		t.Fatal(after)
	}
	again := req(a, "PUT", pa+"/quotes/"+secondID, secondBody, 409).(map[string]any)
	if again["error"] != "La cotización ya tiene resultado" {
		t.Fatal(again)
	}
	againConvert := req(a, "POST", pa+"/quotes/"+secondID+"/convert", "", 409).(map[string]any)
	if againConvert["error"] != "La cotización ya fue convertida en orden" {
		t.Fatal(againConvert)
	}
	var plate, name string
	if e := db.QueryRow(context.Background(), "SELECT v.plate, c.full_name FROM vehicle v JOIN vehicle_link l ON l.vehicle_id = v.id JOIN customer c ON c.id = l.customer_id WHERE v.id = $1", order["vehicle_id"]).Scan(&plate, &name); e != nil || plate != "P999" || name != "Luis Pérez" {
		t.Fatal(plate, name, e)
	}
	req(b, "GET", pb+"/quotes/"+quoteID, "", 404)
	req(b, "GET", pa+"/quotes/"+quoteID, "", 403)
	foreign := req(b, "GET", pb+"/quotes", "", 200).(map[string]any)
	if len(foreign["items"].([]any)) != 0 {
		t.Fatal(foreign)
	}
	vehicle := req(a, "POST", pa+"/vehicles", `{"make":"Mazda","model":"3","plate":"P777","customer":{"full_name":"Marta Ruiz","phone":"7100-0003"}}`, 201).(map[string]any)
	attached := req(a, "POST", pa+"/work-orders", fmt.Sprintf(`{"vehicle_id":%q,"branch_id":%q,"reason":"Revisión"}`, vehicle["id"], ba), 201).(map[string]any)
	saved := req(a, "PUT", pa+"/work-orders/"+attached["id"].(string)+"/quote", `{"items":[{"kind":"mano_de_obra","description":"Servicio","quantity":"1","unit_price":"30.00"}]}`, 200).(map[string]any)
	if saved["total"] != "30.00" || saved["outcome"] != "pendiente" {
		t.Fatal(saved)
	}
	var orderQuoteNumber int32
	if e := db.QueryRow(context.Background(), "SELECT number FROM quote WHERE work_order_id = $1", attached["id"]).Scan(&orderQuoteNumber); e != nil || orderQuoteNumber < 1 {
		t.Fatal(orderQuoteNumber, e)
	}
	listed := req(a, "GET", pa+"/quotes", "", 200).(map[string]any)
	for _, item := range listed["items"].([]any) {
		if item.(map[string]any)["customer_name"] == nil {
			t.Fatal("la cotización de la orden no debe listarse como cotización de mostrador")
		}
	}
	var audits int
	if e := db.QueryRow(context.Background(), "SELECT count(*) FROM audit_event WHERE entity = 'quote' AND action IN ('quote.create','quote.update','quote.outcome','quote.share','quote.convert') AND workshop_id = $1", strings.TrimPrefix(pa, "/api/v1/workshops/")).Scan(&audits); e != nil || audits < 5 {
		t.Fatal(audits, e)
	}
}

func bytesTrim(data []byte) []byte {
	return []byte(strings.TrimSpace(string(data)))
}
