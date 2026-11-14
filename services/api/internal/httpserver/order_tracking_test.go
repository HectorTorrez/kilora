package httpserver

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestOrderTrackingTokenIsRedactedFromRequestLogs(t *testing.T) {
	var output bytes.Buffer
	token := strings.Repeat("s", 43)
	logger := slog.New(slog.NewJSONHandler(&output, nil))
	handler := requestLogger(logger)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNotFound) }))
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/api/v1/public/order-tracking/"+token, nil))
	if strings.Contains(output.String(), token) || !strings.Contains(output.String(), "/api/v1/public/order-tracking/{token}") {
		t.Fatal(output.String())
	}
}
