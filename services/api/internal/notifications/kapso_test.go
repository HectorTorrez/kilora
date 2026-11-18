package notifications

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPhone(t *testing.T) {
	for input, want := range map[string]string{"7100-0009": "50371000009", "+503 7100 0009": "50371000009", "+1 (415) 555-0123": "14155550123"} {
		got, err := Phone(input)
		if err != nil || got != want {
			t.Fatalf("%q: %q %v", input, got, err)
		}
	}
	for _, input := range []string{"", "not a phone", "50371000009 ext 1", "00000000000", "503+71000009", "1234567890123456"} {
		if _, err := Phone(input); err == nil {
			t.Fatalf("accepted %q", input)
		}
	}
}
func TestKapsoTemplateRequest(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/123/messages" || r.Header.Get("X-API-Key") != "secret" {
			t.Errorf("bad request: %s %s", r.Method, r.URL.Path)
		}
		var body struct {
			To       string `json:"to"`
			Type     string `json:"type"`
			Template struct {
				Name     string `json:"name"`
				Language struct {
					Code string `json:"code"`
				} `json:"language"`
				Components []struct {
					Type       string `json:"type"`
					Parameters []struct {
						Type string `json:"type"`
						Text string `json:"text"`
					} `json:"parameters"`
				} `json:"components"`
			} `json:"template"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body.To != "50371000009" || body.Type != "template" || body.Template.Name != "quote_ready" || body.Template.Language.Code != "es" || len(body.Template.Components) != 1 || len(body.Template.Components[0].Parameters) != 2 || body.Template.Components[0].Parameters[1].Text != "https://kilora.dev/c/token" {
			t.Errorf("wrong body: %+v", body)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"messages":[{"id":"wamid.123"}]}`))
	}))
	defer srv.Close()
	k := Kapso{Config: Config{APIKey: "secret", PhoneNumberID: "123", Language: "es", QuoteTemplate: "quote_ready"}, BaseURL: srv.URL}
	id, err := k.Send(context.Background(), "quote", "50371000009", []string{"Taller", "https://kilora.dev/c/token"})
	if err != nil || id != "wamid.123" {
		t.Fatalf("%q %v", id, err)
	}
}
func TestKapsoFailureClassification(t *testing.T) {
	for _, tc := range []struct {
		name             string
		status           int
		body             string
		retry, uncertain bool
	}{
		{"rate limit", 429, `{"error":"contains secret phone"}`, true, false},
		{"invalid template", 400, `{}`, false, false},
		{"unauthorized", 401, `{}`, false, false},
		{"server error", 503, `{}`, false, true},
		{"malformed success", 200, `{}`, false, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(tc.status); w.Write([]byte(tc.body)) }))
			defer srv.Close()
			k := Kapso{Config: Config{APIKey: "secret", PhoneNumberID: "123", Language: "es", QuoteTemplate: "ready"}, BaseURL: srv.URL}
			_, err := k.Send(context.Background(), "quote", "50371000009", []string{"Taller", "url"})
			var se *SendError
			if !errors.As(err, &se) || se.Retry != tc.retry || se.Uncertain != tc.uncertain {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}
