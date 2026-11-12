package assistant

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
)

func TestLoadDocsSplitsSections(t *testing.T) {
	fsys := fstest.MapFS{"knowledge/a.md": {Data: []byte("# Doc\n\nIntro.\n\n## Uno\n\nTexto uno.\n\n## Dos\n\nTexto dos.\n")}}
	chunks, err := LoadDocs(fsys)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"Doc", "Doc — Uno", "Doc — Dos"}
	if len(chunks) != len(want) {
		t.Fatalf("%d fragmentos: %+v", len(chunks), chunks)
	}
	for i, c := range chunks {
		if c.Title != want[i] || c.Source != "a.md" || c.Content == "" {
			t.Errorf("fragmento %d: %+v", i, c)
		}
	}
}

func TestEmbeddedDocsAreChunked(t *testing.T) {
	chunks, err := LoadDocs(knowledgeFS)
	if err != nil {
		t.Fatal(err)
	}
	if len(chunks) < 20 {
		t.Fatalf("solo %d fragmentos", len(chunks))
	}
	ids := map[string]bool{}
	for _, c := range chunks {
		id := chunkID("m", c)
		if ids[id] {
			t.Fatalf("id repetido: %s", c.Title)
		}
		ids[id] = true
	}
}

func TestToolPath(t *testing.T) {
	const w = "11111111-1111-1111-1111-111111111111"
	const v = "22222222-2222-2222-2222-222222222222"
	ok := map[string][2]string{
		"/api/v1/me/vehicles": {"list_my_vehicles", `{}`},
		"/api/v1/me/vehicles/" + v + "/history?limit=50&offset=50":                                   {"get_my_vehicle_history", `{"vehicle_id":"` + v + `","offset":50}`},
		"/api/v1/workshops/" + w + "/":                                                               {"get_workshop", `{"workshop_id":"` + w + `"}`},
		"/api/v1/workshops/" + w + "/vehicles/" + v + "/history":                                     {"get_vehicle_history", `{"workshop_id":"` + w + `","vehicle_id":"` + v + `"}`},
		"/api/v1/workshops/" + w + "/work-orders/page?limit=50&q=P+123&status=recibido&status=listo": {"list_work_orders", `{"workshop_id":"` + w + `","status":["recibido","listo"],"q":"P 123"}`},
		"/api/v1/workshops/" + w + "/recommendations?status=pendiente":                               {"list_recommendations", `{"workshop_id":"` + w + `","status":"pendiente"}`},
	}
	for want, call := range ok {
		got, err := ToolPath(call[0], call[1])
		if err != nil || got != want {
			t.Errorf("%s: %q, %v; esperaba %q", call[0], got, err, want)
		}
	}
	bad := [][2]string{
		{"delete_everything", `{}`},
		{"get_my_vehicle", `{"vehicle_id":"../../workshops"}`},
		{"get_vehicle", `{"vehicle_id":"` + v + `"}`},
		{"get_vehicle", `{"workshop_id":"x/../..","vehicle_id":"` + v + `"}`},
		{"list_work_orders", `{"workshop_id":"` + w + `","status":["borrado"]}`},
		{"list_work_orders", `{"workshop_id":"` + w + `","from":"ayer"}`},
		{"list_recommendations", `{"workshop_id":"` + w + `","status":"x"}`},
		{"get_my_vehicle", `no es json`},
	}
	for _, call := range bad {
		if got, err := ToolPath(call[0], call[1]); err == nil {
			t.Errorf("%s %s: aceptó %q", call[0], call[1], got)
		}
	}
}

func TestOwnerOnlyUsersGetNoWorkshopTools(t *testing.T) {
	for _, tool := range toolDefinitions(false) {
		if spec, ok := toolByName(tool.Function.Name); ok && spec.workshop {
			t.Fatalf("herramienta de taller ofrecida a propietario: %s", tool.Function.Name)
		}
	}
	if len(toolDefinitions(true)) != len(dataTools)+1 {
		t.Fatal("faltan herramientas")
	}
}

func TestTopK(t *testing.T) {
	chunks := []Chunk{{Title: "a", Embedding: []float32{1, 0}}, {Title: "b", Embedding: []float32{0, 1}}, {Title: "c", Embedding: []float32{0.7, 0.7}}}
	got := topK(chunks, []float32{0, 1}, 2)
	if len(got) != 2 || got[0].Title != "b" || got[1].Title != "c" {
		t.Fatalf("%+v", got)
	}
}

// fakeOpenAI responde los chats en orden y registra lo que recibió.
type fakeOpenAI struct {
	mu       sync.Mutex
	replies  []Message
	requests [][]Message
}

func (f *fakeOpenAI) server(t *testing.T) *httptest.Server {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test" {
			http.Error(w, "sin clave", 401)
			return
		}
		f.mu.Lock()
		defer f.mu.Unlock()
		switch r.URL.Path {
		case "/chat/completions":
			var body struct{ Messages []Message }
			_ = json.NewDecoder(r.Body).Decode(&body)
			f.requests = append(f.requests, body.Messages)
			msg := f.replies[0]
			f.replies = f.replies[1:]
			StreamTestMessage(w, msg)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

func call(id, name, args string) ToolCall {
	c := ToolCall{ID: id, Type: "function"}
	c.Function.Name, c.Function.Arguments = name, args
	return c
}

func TestAgentRunsDataTools(t *testing.T) {
	const v = "22222222-2222-2222-2222-222222222222"
	fake := &fakeOpenAI{replies: []Message{
		{Role: "assistant", ToolCalls: []ToolCall{call("1", "get_my_vehicle_history", `{"vehicle_id":"`+v+`"}`), call("2", "get_vehicle", `{"vehicle_id":"`+v+`"}`)}},
		{Role: "assistant", Content: text("Tu último cambio de aceite fue el 3 de marzo.")},
	}}
	srv := fake.server(t)
	agent := &Agent{Client: &OpenAI{APIKey: "test", BaseURL: srv.URL, Model: "m"}}
	var fetched []string
	fetch := func(_ context.Context, path string) (int, []byte, error) {
		fetched = append(fetched, path)
		return 200, []byte(`{"records":[]}`), nil
	}
	msg := "¿Cuándo cambié el aceite?"
	var events []Event
	reply, err := agent.Run(context.Background(), Session{UserName: "Ana"}, []Message{{Role: "user", Content: &msg}}, fetch, func(e Event) { events = append(events, e) })
	if err != nil {
		t.Fatal(err)
	}
	if reply.Text != "Tu último cambio de aceite fue el 3 de marzo." {
		t.Fatalf("%+v", reply)
	}
	var streamed strings.Builder
	statuses := 0
	for _, e := range events {
		switch e.Type {
		case "delta":
			streamed.WriteString(e.Text)
		case "status":
			statuses++
		}
	}
	if streamed.String() != reply.Text || statuses != 2 {
		t.Fatalf("eventos: %+v", events)
	}
	if len(fetched) != 1 || fetched[0] != "/api/v1/me/vehicles/"+v+"/history?limit=50" {
		t.Fatalf("consultas: %v", fetched)
	}
	second := fake.requests[1]
	tools := second[len(second)-2:]
	if *tools[0].Content != `{"records":[]}` || !strings.Contains(*tools[1].Content, "workshop_id inválido") {
		t.Fatalf("resultados: %s | %s", *tools[0].Content, *tools[1].Content)
	}
	if !strings.Contains(*fake.requests[0][0].Content, "no pertenece a ningún taller") {
		t.Fatal("el prompt no describe al propietario")
	}
}

func TestAgentStopsAfterMaxSteps(t *testing.T) {
	loop := Message{Role: "assistant", ToolCalls: []ToolCall{call("x", "list_my_vehicles", `{}`)}}
	replies := make([]Message, 0, maxSteps+1)
	for i := 0; i < maxSteps; i++ {
		replies = append(replies, loop)
	}
	replies = append(replies, Message{Role: "assistant", Content: text("listo")})
	fake := &fakeOpenAI{replies: replies}
	srv := fake.server(t)
	agent := &Agent{Client: &OpenAI{APIKey: "test", BaseURL: srv.URL, Model: "m"}}
	msg := "hola"
	reply, err := agent.Run(context.Background(), Session{}, []Message{{Role: "user", Content: &msg}}, func(context.Context, string) (int, []byte, error) { return 200, []byte(`[]`), nil }, nil)
	if err != nil || reply.Text != "listo" {
		t.Fatalf("%+v %v", reply, err)
	}
	if len(fake.requests) != maxSteps+1 {
		t.Fatalf("%d llamadas", len(fake.requests))
	}
}

func TestPromptLimitsScopeToKilora(t *testing.T) {
	prompt := systemPrompt(Session{UserName: "Ana"})
	if !strings.Contains(prompt, "Alcance") || !strings.Contains(prompt, OffTopicReply) {
		t.Fatal("el prompt no limita el alcance a Kilora")
	}
}
