package httpserver

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestSlowRoutesOutliveServerWriteTimeout(t *testing.T) {
	handler := timeouts(200*time.Millisecond, map[string]time.Duration{assistantChatPath: time.Second}, aiPaths, time.Second)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-time.After(100 * time.Millisecond):
			_, _ = io.WriteString(w, "complete")
		case <-r.Context().Done():
			return
		}
	}))
	server := httptest.NewUnstartedServer(handler)
	server.Config.WriteTimeout = 20 * time.Millisecond
	server.Start()
	defer server.Close()
	for _, path := range []string{"/api/v1/workshops/test/ai/quote-draft", "/api/v1/me/vehicles/test/report", assistantChatPath, "/api/v1/auth/me"} {
		t.Run(path, func(t *testing.T) {
			resp, err := server.Client().Get(server.URL + path)
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()
			body, err := io.ReadAll(resp.Body)
			if err != nil || resp.StatusCode != 200 || string(body) != "complete" {
				t.Fatalf("status %d, body %q, error %v", resp.StatusCode, body, err)
			}
		})
	}
}

func TestRouteContextDeadlinesRemainBounded(t *testing.T) {
	handler := timeouts(20*time.Millisecond, map[string]time.Duration{assistantChatPath: 50 * time.Millisecond}, aiPaths, 40*time.Millisecond)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	server := httptest.NewServer(handler)
	defer server.Close()
	for _, path := range []string{"/api/v1/auth/me", assistantChatPath, "/api/v1/workshops/test/ai/message"} {
		resp, err := server.Client().Get(server.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusGatewayTimeout {
			t.Fatalf("%s: got %d, want 504", path, resp.StatusCode)
		}
	}
}
