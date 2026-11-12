package httpserver

import (
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

