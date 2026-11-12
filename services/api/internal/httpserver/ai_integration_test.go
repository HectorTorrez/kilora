package httpserver

import (
	"encoding/base64"
	"fmt"
	"github.com/google/uuid"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"kilora/api/internal/assistant"
	"kilora/api/internal/database/sqlc"
)

// fakeAI simula la salida estructurada de OpenAI: answer recibe el cuerpo de
// la petición al modelo y devuelve el JSON que el modelo "respondería".
type fakeAI struct {
	mu       sync.Mutex
	requests []string
}

func (f *fakeAI) last() string {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.requests) == 0 {
		return ""
	}
	return f.requests[len(f.requests)-1]
}

// newAITestAPI levanta el API con la IA apuntando a un modelo falso.
func newAITestAPI(t *testing.T, answer func(prompt string) any) (*testAPI, *fakeAI) {
	t.Helper()
	base := newTestAPI(t)
	f := &fakeAI{}
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		data, _ := io.ReadAll(r.Body)
		f.mu.Lock()
		f.requests = append(f.requests, string(data))
		f.mu.Unlock()
		assistant.StructuredTestResponse(w, answer(string(data)))
	}))
	t.Cleanup(fake.Close)
	srv := httptest.NewServer(NewRouter(Deps{DB: base.db, Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), WebOrigin: testOrigin, Mailer: base.mail, AI: &assistant.OpenAI{APIKey: "k", BaseURL: fake.URL, Model: "m"}}))
	t.Cleanup(srv.Close)
	return &testAPI{t: t, db: base.db, q: base.q, srv: srv, mail: base.mail}, f
}

func TestQuoteDraftIsValidatedAndNeverInventsPrices(t *testing.T) {
	api, fake := newAITestAPI(t, func(string) any {
		return map[string]any{"items": []any{
			map[string]any{"kind": "repuesto", "description": " Aceite 5W-30 ", "quantity": 4, "unit_price": nil, "part": "aceite_motor"},
			map[string]any{"kind": "mano_de_obra", "description": "Cambio de pastillas", "quantity": 0, "unit_price": 25.5, "part": "no_existe"},
			map[string]any{"kind": "otro", "description": "Inventado", "quantity": 1, "unit_price": nil, "part": nil},
			map[string]any{"kind": "repuesto", "description": "  ", "quantity": 1, "unit_price": nil, "part": nil},
		}}
	})
	admin := api.client()
	path, workshop, branch, _ := api.workshop(admin)

	got := api.obj(admin, "POST", path+"/ai/quote-draft", `{"text":"aceite 5w30 4 litros y pastillas delanteras, mano de obra $25.50","vehicle":"Toyota Corolla 2015"}`, 200)
	items := got["items"].([]any)
	if len(items) != 2 {
		t.Fatalf("ítems: %v", items)
	}
	oil, labor := items[0].(map[string]any), items[1].(map[string]any)
	if oil["description"] != "Aceite 5W-30" || oil["quantity"] != "4" || oil["unit_price"] != nil || oil["part"] != "aceite_motor" {
		t.Fatalf("aceite: %v", oil)
	}
	if labor["quantity"] != "1" || labor["unit_price"] != "25.50" || labor["part"] != nil {
		t.Fatalf("mano de obra: %v", labor)
	}
	prompt := fake.last()
	if !strings.Contains(prompt, "Toyota Corolla 2015") || !strings.Contains(prompt, "pastillas_delanteras") || !strings.Contains(prompt, `"strict":true`) {
		t.Fatalf("prompt: %s", prompt)
	}

	api.req(admin, "POST", path+"/ai/quote-draft", `{"text":"  "}`, 400)
	api.req(admin, "POST", path+"/ai/quote-draft", `{"text":"`+strings.Repeat("a", 2001)+`"}`, 400)
	mechanic := api.client()
	api.member(mechanic, workshop, branch, sqlc.MembershipRoleMecanico)
	api.req(mechanic, "POST", path+"/ai/quote-draft", `{"text":"frenos"}`, 403)
	api.req(api.client(), "POST", path+"/ai/quote-draft", `{"text":"frenos"}`, 401)
	other := api.client()
	api.workshop(other)
	api.req(other, "POST", path+"/ai/quote-draft", `{"text":"frenos"}`, 403)
}

func TestAIRoutesDisabledWithoutKey(t *testing.T) {
	api := newTestAPI(t)
	c := api.client()
	path, _, _, _ := api.workshop(c)
	api.req(c, "POST", path+"/ai/quote-draft", `{"text":"frenos"}`, 503)
}

func TestReceiptIsOwnerOnlyAndValidated(t *testing.T) {
	api, fake := newAITestAPI(t, func(string) any {
		return map[string]any{
			"readable": true, "performed_on": "2024-03-15", "odometer_km": 85210.4, "workshop_name": " Taller El Pino ",
			"summary": "Cambio de aceite", "total": 45,
			"items": []any{
				map[string]any{"description": "Aceite 5W-30", "price": 30},
				map[string]any{"description": "Filtro", "price": -2},
				map[string]any{"description": " ", "price": 1},
			},
		}
	})
	owner := api.client()
	api.register(owner)
	v := api.obj(owner, "POST", "/api/v1/me/vehicles", `{"make":"Kia","model":"Rio"}`, 201)
	path := "/api/v1/me/vehicles/" + v["id"].(string) + "/ai/receipt"
	// Una foto de ~2 MB supera el límite general de 1 MB pero cabe en el del recibo.
	photo := "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(make([]byte, 2<<20))

	got := api.obj(owner, "POST", path, `{"image":"`+photo+`"}`, 200)
	if got["performed_on"] != "2024-03-15" || got["odometer_km"] != float64(85210) || got["workshop_name"] != "Taller El Pino" || got["total"] != "45.00" {
		t.Fatalf("recibo: %v", got)
	}
	items := got["items"].([]any)
	if len(items) != 2 || items[0].(map[string]any)["price"] != "30.00" || items[1].(map[string]any)["price"] != nil {
		t.Fatalf("ítems: %v", items)
	}
	if !strings.Contains(fake.last(), `"image_url"`) {
		t.Fatal("la foto no llegó al modelo")
	}

	api.req(owner, "POST", path, `{"image":"data:text/html;base64,PGI+"}`, 400)
	api.req(owner, "POST", path, `{"image":"data:image/png;base64,***"}`, 400)
	stranger := api.client()
	api.register(stranger)
	api.req(stranger, "POST", path, `{"image":"`+photo+`"}`, 404)
	if n := len(fake.requests); n != 1 {
		t.Fatalf("%d llamadas al modelo, esperaba 1", n)
	}
}

func TestReceiptRejectsFutureDates(t *testing.T) {
	api, _ := newAITestAPI(t, func(string) any {
		return map[string]any{"readable": true, "performed_on": "2999-01-01", "odometer_km": nil, "workshop_name": nil, "summary": "x", "total": nil, "items": []any{}}
	})
	owner := api.client()
	api.register(owner)
	v := api.obj(owner, "POST", "/api/v1/me/vehicles", `{"make":"Kia","model":"Rio"}`, 201)
	got := api.obj(owner, "POST", "/api/v1/me/vehicles/"+v["id"].(string)+"/ai/receipt", `{"image":"data:image/png;base64,iVBORw0KGgo="}`, 200)
	if got["performed_on"] != nil {
		t.Fatalf("aceptó una fecha futura: %v", got)
	}
}

// publishedForOwner crea un taller con un servicio publicado (con costos y
// notas internas) en un vehículo ya vinculado a su propietario.
func publishedForOwner(t *testing.T, api *testAPI) (workshop, owner *http.Client, path, vehicleID, orderPath string) {
	t.Helper()
	workshop, owner = api.client(), api.client()
	path, _, branch, _ := api.workshop(workshop)
	_, email := api.register(owner)
	v := api.obj(workshop, "POST", path+"/vehicles", `{"plate":"P123","make":"Toyota","model":"Corolla","year":2015,"customer":{"full_name":"Ana López","phone":"7100-0004"}}`, 201)
	vehicleID = v["id"].(string)
	o := api.obj(workshop, "POST", path+"/work-orders", fmt.Sprintf(`{"vehicle_id":%q,"branch_id":%q,"reason":"Servicio","internal_notes":"secreto_interno"}`, vehicleID, branch), 201)
	orderPath = path + "/work-orders/" + o["id"].(string)
	api.req(workshop, "POST", orderPath+"/jobs", `{"description":"Cambio de aceite","labor_price":"12.50","internal_cost":"3.00","mechanic_notes":"secreto_mecanico"}`, 201)
	for _, status := range []string{"diagnostico", "en_reparacion", "listo"} {
		api.req(workshop, "PATCH", orderPath+"/status", fmt.Sprintf(`{"status":%q}`, status), 200)
	}
	inv := api.obj(workshop, "POST", path+"/vehicles/"+vehicleID+"/invitations", fmt.Sprintf(`{"email":%q}`, email), 201)
	parts := strings.Split(inv["url"].(string), "/")
	api.req(owner, "POST", "/api/v1/invitations/"+parts[len(parts)-1]+"/accept", `{"consent":true}`, 200)
	return workshop, owner, path, vehicleID, orderPath
}

func TestExplainRecordSendsOnlyTheOwnerProjection(t *testing.T) {
	api, fake := newAITestAPI(t, func(string) any {
		return map[string]any{"explanation": " Le cambiaron el aceite al motor. "}
	})
	workshop, owner, _, vid, _ := publishedForOwner(t, api)
	hist := api.obj(owner, "GET", "/api/v1/me/vehicles/"+vid+"/history", "", 200)
	rid := hist["records"].([]any)[0].(map[string]any)["id"].(string)
	path := "/api/v1/me/vehicles/" + vid + "/history/" + rid + "/ai/explain"

	got := api.obj(owner, "POST", path, "", 200)
	if got["explanation"] != "Le cambiaron el aceite al motor." {
		t.Fatalf("explicación: %v", got)
	}
	prompt := fake.last()
	if !strings.Contains(prompt, "Cambio de aceite") || !strings.Contains(prompt, "Toyota Corolla 2015") {
		t.Fatalf("faltan datos: %s", prompt)
	}
	for _, secret := range []string{"secreto_interno", "secreto_mecanico", "internal_cost", rid} {
		if strings.Contains(prompt, secret) {
			t.Fatalf("el modelo recibió %q: %s", secret, prompt)
		}
	}
	api.req(workshop, "POST", path, "", 404)
	api.req(owner, "POST", "/api/v1/me/vehicles/"+vid+"/history/"+uuid.NewString()+"/ai/explain", "", 404)
}

func TestQuoteMessageUsesTheSavedQuote(t *testing.T) {
	api, fake := newAITestAPI(t, func(string) any {
		return map[string]any{"message": "Hola, le enviamos la cotización."}
	})
	admin := api.client()
	path, workshop, branch, _ := api.workshop(admin)
	v := api.obj(admin, "POST", path+"/vehicles", `{"make":"Kia","model":"Rio","year":2019,"customer":{"full_name":"Ana López","phone":"7777-8888"}}`, 201)
	o := api.obj(admin, "POST", path+"/work-orders", fmt.Sprintf(`{"vehicle_id":%q,"branch_id":%q,"reason":"Frenos"}`, v["id"], branch), 201)
	op := path + "/work-orders/" + o["id"].(string)
	api.req(admin, "POST", op+"/quote/ai/message", "", 404)
	api.req(admin, "PUT", op+"/quote", `{"items":[{"kind":"repuesto","description":"Pastillas delanteras","quantity":"2","unit_price":"20.25","part":"pastillas_delanteras"}]}`, 200)

	got := api.obj(admin, "POST", op+"/quote/ai/message", "", 200)
	if got["message"] != "Hola, le enviamos la cotización." {
		t.Fatalf("mensaje: %v", got)
	}
	prompt := fake.last()
	for _, want := range []string{"Pastillas delanteras", "40.50", "Kia Rio 2019"} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("falta %q: %s", want, prompt)
		}
	}
	mechanic := api.client()
	api.member(mechanic, workshop, branch, sqlc.MembershipRoleMecanico)
	api.req(mechanic, "POST", op+"/quote/ai/message", "", 403)

	q := api.obj(admin, "POST", path+"/quotes", fmt.Sprintf(`{"customer_name":"Luis Pérez","customer_phone":"7000-1111","vehicle_model":"Hilux","branch_id":%q,"items":[{"kind":"mano_de_obra","description":"Alineación","quantity":"1","unit_price":"15.00"}]}`, branch), 201)
	api.obj(admin, "POST", path+"/quotes/"+q["id"].(string)+"/ai/message", "", 200)
	if prompt := fake.last(); !strings.Contains(prompt, "Luis Pérez") || !strings.Contains(prompt, "Alineación") || !strings.Contains(prompt, "valida_hasta") {
		t.Fatalf("mostrador: %s", prompt)
	}
}

func TestSuggestRecommendationsFromVisibleHistory(t *testing.T) {
	api, fake := newAITestAPI(t, func(string) any {
		return map[string]any{"suggestions": []any{map[string]any{"category": "frenos", "description": "Revisar pastillas delanteras: el último cambio fue hace casi 4 años"}}}
	})
	workshop, owner, path, vid, _ := publishedForOwner(t, api)
	// Servicio viejo de frenos registrado por el propietario, sin categoría: se infiere del texto.
	api.req(owner, "POST", "/api/v1/me/vehicles/"+vid+"/history", `{"performed_on":"2023-01-10","odometer_km":30000,"summary":"Pastillas delanteras","items":[{"kind":"pieza","description":"Pastillas delanteras","price":"40.00"}]}`, 201)
	suggest := path + "/vehicles/" + vid + "/recommendations/suggest"

	got := api.obj(workshop, "POST", suggest, "", 200)
	list := got["suggestions"].([]any)
	if len(list) != 1 {
		t.Fatalf("sugerencias: %v", list)
	}
	brakes := list[0].(map[string]any)
	if brakes["category"] != "frenos" || brakes["overdue"] != true || brakes["due_km"] != float64(60000) || brakes["due_date"] != "2025-01-10" || brakes["ai_worded"] != true || !strings.HasPrefix(brakes["description"].(string), "Revisar pastillas") {
		t.Fatalf("frenos: %v", brakes)
	}
	if prompt := fake.last(); strings.Contains(prompt, "secreto") || !strings.Contains(prompt, "Pastillas delanteras") {
		t.Fatalf("prompt: %s", prompt)
	}

	// Con una recomendación pendiente de frenos ya no se sugiere otra.
	api.req(workshop, "POST", path+"/vehicles/"+vid+"/recommendations", `{"description":"Frenos","category":"frenos","due_km":60000}`, 201)
	if list := api.obj(workshop, "POST", suggest, "", 200)["suggestions"].([]any); len(list) != 0 {
		t.Fatalf("repitió la sugerencia: %v", list)
	}
	other := api.client()
	otherPath, _, _, _ := api.workshop(other)
	api.req(other, "POST", otherPath+"/vehicles/"+vid+"/recommendations/suggest", "", 404)
}

func TestSuggestRecommendationsWorksWithoutAI(t *testing.T) {
	api := newTestAPI(t)
	workshop, owner, path, vid, _ := publishedForOwner(t, api)
	api.req(owner, "POST", "/api/v1/me/vehicles/"+vid+"/history", `{"performed_on":"2020-05-01","summary":"Cambio de batería","items":[]}`, 201)
	list := api.obj(workshop, "POST", path+"/vehicles/"+vid+"/recommendations/suggest", "", 200)["suggestions"].([]any)
	if len(list) != 1 {
		t.Fatalf("sugerencias: %v", list)
	}
	battery := list[0].(map[string]any)
	if battery["category"] != "bateria" || battery["ai_worded"] != false || !strings.HasPrefix(battery["description"].(string), "Revisar batería: último servicio hace") {
		t.Fatalf("batería: %v", battery)
	}
}

func TestResaleReportHidesMoneyAndNotes(t *testing.T) {
	api, fake := newAITestAPI(t, func(string) any {
		return map[string]any{"summary": "Historial con un servicio de taller."}
	})
	_, owner, _, vid, _ := publishedForOwner(t, api)
	api.req(owner, "POST", "/api/v1/me/vehicles/"+vid+"/history", `{"performed_on":"2024-02-01","summary":"Cambio de batería","items":[{"kind":"pieza","description":"Batería","price":"99.99"}],"total":"99.99","workshop_name_text":"Lugar privado"}`, 201)
	base := "/api/v1/me/vehicles/" + vid + "/report"
	if got := api.obj(owner, "GET", base, "", 200); got["active"] != nil {
		t.Fatalf("ya había reporte: %v", got)
	}

	created := api.obj(owner, "POST", base, "", 201)
	if created["summary"] != "Historial con un servicio de taller." || !strings.Contains(created["whatsapp_url"].(string), "wa.me") {
		t.Fatalf("reporte: %v", created)
	}
	token := created["url"].(string)[strings.LastIndex(created["url"].(string), "/")+1:]
	secrets := []string{"secreto", "12.50", "99.99", "3.00", "Lugar privado", "internal", "total", "price"}
	prompt := fake.last()
	for _, s := range secrets {
		if strings.Contains(prompt, s) {
			t.Fatalf("el modelo recibió %q: %s", s, prompt)
		}
	}
	anon := api.client()
	public := string(api.raw(anon, "GET", "/api/v1/public/reports/"+token, "", 200))
	for _, s := range secrets {
		if strings.Contains(public, s) {
			t.Fatalf("el reporte público muestra %q: %s", s, public)
		}
	}
	for _, s := range []string{"Cambio de aceite", "Cambio de batería", `"workshop_name":"Taller"`, `"services":2`, `"owner_records":1`, "Historial con un servicio"} {
		if !strings.Contains(public, s) {
			t.Fatalf("falta %q: %s", s, public)
		}
	}
	if got := api.obj(owner, "GET", base, "", 200); got["active"] == nil {
		t.Fatal("el reporte no aparece activo")
	}

	// Un enlace nuevo desactiva el anterior; desactivar corta el acceso.
	second := api.obj(owner, "POST", base, "", 201)["url"].(string)
	api.req(anon, "GET", "/api/v1/public/reports/"+token, "", 404)
	api.req(anon, "GET", "/api/v1/public/reports/"+second[strings.LastIndex(second, "/")+1:], "", 200)
	api.req(owner, "DELETE", base, "", 204)
	api.req(anon, "GET", "/api/v1/public/reports/"+second[strings.LastIndex(second, "/")+1:], "", 404)

	stranger := api.client()
	api.register(stranger)
	api.req(stranger, "POST", base, "", 404)
	api.req(stranger, "DELETE", base, "", 404)
}

func TestResaleReportWithoutAI(t *testing.T) {
	api := newTestAPI(t)
	_, owner, _, vid, _ := publishedForOwner(t, api)
	created := api.obj(owner, "POST", "/api/v1/me/vehicles/"+vid+"/report", "", 201)
	if created["summary"] != nil {
		t.Fatalf("resumen sin IA: %v", created)
	}
	url := created["url"].(string)
	api.req(api.client(), "GET", "/api/v1/public/reports/"+url[strings.LastIndex(url, "/")+1:], "", 200)
}
