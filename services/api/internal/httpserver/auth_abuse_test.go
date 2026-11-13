package httpserver

import (
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"
	"time"
)

func TestAuthRateLimitsBeforeDatabaseOrPasswordHashing(t *testing.T) {
	for _, tc := range []struct {
		path, body string
		limit      int
	}{
		{"register", `{}`, 20},
		{"reset-password", `{}`, 10},
		{"forgot-password", `{`, 10},
		{"resend-verification", `{`, 10},
		{"verify-email", `{`, 20},
	} {
		t.Run(tc.path, func(t *testing.T) {
			h := NewRouter(Deps{})
			for i := 0; i <= tc.limit; i++ {
				req := httptest.NewRequest("POST", "/api/v1/auth/"+tc.path, strings.NewReader(tc.body))
				req.RemoteAddr = "192.0.2.1:1234"
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("X-Forwarded-For", "203.0.113."+string(rune('a'+i)))
				rec := httptest.NewRecorder()
				h.ServeHTTP(rec, req)
				if i == tc.limit && rec.Code != http.StatusTooManyRequests {
					t.Fatalf("got %d, want 429", rec.Code)
				}
			}
		})
	}
}

func TestTrustedClientIP(t *testing.T) {
	for _, tc := range []struct{ name, peer, forwarded, want string }{
		{"direct spoof", "192.0.2.1:1234", "203.0.113.1", "192.0.2.1"},
		{"proxy", "10.0.0.1:1234", "203.0.113.1", "203.0.113.1"},
		{"spoof before client", "10.0.0.1:1234", "198.51.100.1, 203.0.113.1", "203.0.113.1"},
		{"proxy chain", "10.0.0.1:1234", "203.0.113.1, 10.0.0.2", "203.0.113.1"},
		{"invalid", "10.0.0.1:1234", "invalid", "10.0.0.1"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/", nil)
			req.RemoteAddr = tc.peer
			req.Header.Set("X-Forwarded-For", tc.forwarded)
			req.Header.Set("True-Client-IP", "198.51.100.99")
			h := trustedClientIP([]netip.Prefix{netip.MustParsePrefix("10.0.0.0/24")})(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
				if got := clientIP(r); got != tc.want {
					t.Fatalf("got %q, want %q", got, tc.want)
				}
			}))
			h.ServeHTTP(httptest.NewRecorder(), req)
		})
	}
}

func TestRecoveryEmailBudgetDoesNotRevealAccount(t *testing.T) {
	api := newTestAPI(t)
	client := api.client()
	_, email := api.register(client)
	for i := 0; i < 5; i++ {
		api.req(client, "POST", "/api/v1/auth/forgot-password", `{"email":"`+email+`"}`, 204)
	}
	api.mail.mu.Lock()
	defer api.mail.mu.Unlock()
	if got := len(api.mail.bodies); got != 4 {
		t.Fatalf("got %d messages, want registration plus three resets", got)
	}
}

func TestLoginBudgetsAcrossAddressesAndAccounts(t *testing.T) {
	api := newTestAPI(t)
	client := api.client()
	_, email := api.register(client)
	for i := 1; i < loginAttemptLimit; i++ {
		api.req(client, "POST", "/api/v1/auth/login", `{"email":"`+email+`","password":"wrong"}`, 401)
	}
	api.req(client, "POST", "/api/v1/auth/login", `{"email":"`+email+`","password":"wrong"}`, 429)
}

func TestLimiterWindowExpires(t *testing.T) {
	l := limiter{attempts: map[string][]time.Time{"expired": {time.Now().Add(-limiterWindow - time.Second)}}}
	if !l.allow("expired", 1) || l.allow("expired", 1) {
		t.Fatal("expired budget should replenish once")
	}
}
