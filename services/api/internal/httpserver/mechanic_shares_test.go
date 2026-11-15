package httpserver

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMechanicShareTokenRedactedFromLogs(t *testing.T) {
	var output bytes.Buffer
	token := strings.Repeat("s", 43)
	handler := requestLogger(slog.New(slog.NewJSONHandler(&output, nil)))(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNotFound) }))
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/api/v1/public/mechanic-shares/"+token, nil))
	if strings.Contains(output.String(), token) || !strings.Contains(output.String(), "/api/v1/public/mechanic-shares/{token}") {
		t.Fatal(output.String())
	}
}
