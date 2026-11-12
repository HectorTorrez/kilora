package httpserver

import (
	"encoding/base64"
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
