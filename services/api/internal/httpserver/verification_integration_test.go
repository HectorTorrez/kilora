package httpserver

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"kilora/api/internal/auth"
	"kilora/api/internal/database/sqlc"
)

func TestRegistrationRequiresVerification(t *testing.T) {
	a := newTestAPI(t)
	c := a.client()
	email := uuid.NewString() + "@example.com"
	credentials := fmt.Sprintf(`{"email":%q,"password":"password123"}`, email)
	reg := a.obj(c, "POST", "/api/v1/auth/register", fmt.Sprintf(`{"email":%q,"password":"password123","full_name":"Prueba"}`, email), 201)
	id := uuid.MustParse(reg["user"].(map[string]any)["id"].(string))
	origin, _ := url.Parse(a.srv.URL)
	if len(c.Jar.Cookies(origin)) != 0 {
		t.Fatal("registration created a session cookie")
	}
	var count int
	if err := a.db.QueryRow(context.Background(), "SELECT count(*) FROM session WHERE user_id = $1", id).Scan(&count); err != nil || count != 0 {
		t.Fatalf("registration sessions: %d, %v", count, err)
	}
	token := a.verificationToken()
	a.req(c, "GET", "/api/v1/auth/me", "", 401)
	a.req(c, "POST", "/api/v1/workshops", `{"name":"Taller","branch_name":"Principal"}`, 401)
	a.req(c, "POST", "/api/v1/auth/login", fmt.Sprintf(`{"email":%q,"password":"wrong"}`, email), 401)
	a.req(c, "POST", "/api/v1/auth/login", credentials, 403)
	// Sessions issued before email verification became mandatory cannot bypass it.
	legacy, hash, err := auth.NewTokenPair()
	if err != nil {
		t.Fatal(err)
	}
	if err := a.q.CreateSession(context.Background(), sqlc.CreateSessionParams{ID: hash, UserID: id, ExpiresAt: timestamptz(time.Now().Add(time.Hour))}); err != nil {
		t.Fatal(err)
	}
	c.Jar.SetCookies(origin, []*http.Cookie{{Name: auth.SessionCookie, Value: legacy, Path: "/"}})
	a.req(c, "GET", "/api/v1/auth/me", "", 401)
	a.req(c, "POST", "/api/v1/auth/verify-email", fmt.Sprintf(`{"token":%q}`, token), 204)
	a.req(c, "POST", "/api/v1/auth/verify-email", fmt.Sprintf(`{"token":%q}`, token), 400)
	a.req(c, "GET", "/api/v1/auth/me", "", 401)
	a.req(c, "POST", "/api/v1/auth/login", credentials, 204)
	me := a.obj(c, "GET", "/api/v1/auth/me", "", 200)
	if me["user"].(map[string]any)["email_verified_at"] == nil {
		t.Fatal("missing verification timestamp")
	}
}

func TestExpiredVerificationAndResend(t *testing.T) {
	a := newTestAPI(t)
	c := a.client()
	email := uuid.NewString() + "@example.com"
	a.req(c, "POST", "/api/v1/auth/register", fmt.Sprintf(`{"email":%q,"password":"password123","full_name":"Prueba"}`, email), 201)
	expired := a.verificationToken()
	if _, err := a.db.Exec(context.Background(), "UPDATE auth_token SET expires_at = now() - interval '1 second' WHERE token_hash = $1", auth.HashToken(expired)); err != nil {
		t.Fatal(err)
	}
	a.req(c, "POST", "/api/v1/auth/verify-email", fmt.Sprintf(`{"token":%q}`, expired), 400)
	a.req(c, "POST", "/api/v1/auth/verify-email", `{"token":"invalid"}`, 400)
	for i := 0; i < 5; i++ {
		if i%2 == 0 {
			email = strings.ToUpper(email)
		} else {
			email = strings.ToLower(email)
		}
		a.req(c, "POST", "/api/v1/auth/resend-verification", fmt.Sprintf(`{"email":%q}`, email), 204)
	}
	if len(a.mail.bodies) != 4 {
		t.Fatalf("expected registration plus three resends, got %d", len(a.mail.bodies))
	}
	fresh := a.verificationToken()
	if fresh == expired {
		t.Fatal("resend reused token")
	}
	a.req(c, "POST", "/api/v1/auth/verify-email", fmt.Sprintf(`{"token":%q}`, fresh), 204)
	a.req(c, "POST", "/api/v1/auth/login", fmt.Sprintf(`{"email":%q,"password":"password123"}`, email), 204)
	_, verifiedEmail := a.register(a.client())
	before := len(a.mail.bodies)
	for _, address := range []string{uuid.NewString() + "@example.com", verifiedEmail} {
		a.req(c, "POST", "/api/v1/auth/resend-verification", fmt.Sprintf(`{"email":%q}`, address), 204)
	}
	if len(a.mail.bodies) != before {
		t.Fatal("resend sent to verified or missing account")
	}
}

func TestPasswordResetDoesNotVerifyEmail(t *testing.T) {
	a := newTestAPI(t)
	c := a.client()
	email := uuid.NewString() + "@example.com"
	a.req(c, "POST", "/api/v1/auth/register", fmt.Sprintf(`{"email":%q,"password":"password123","full_name":"Prueba"}`, email), 201)
	a.req(c, "POST", "/api/v1/auth/forgot-password", fmt.Sprintf(`{"email":%q}`, email), 204)
	token := a.verificationToken()
	a.req(c, "POST", "/api/v1/auth/verify-email", fmt.Sprintf(`{"token":%q}`, token), 400)
	a.req(c, "POST", "/api/v1/auth/reset-password", fmt.Sprintf(`{"token":%q,"password":"newpassword123"}`, token), 204)
	a.req(c, "POST", "/api/v1/auth/login", fmt.Sprintf(`{"email":%q,"password":"newpassword123"}`, email), 403)
}

func TestVerificationDeliveryFailureCanBeRecovered(t *testing.T) {
	a := newTestAPI(t)
	c := a.client()
	email := uuid.NewString() + "@example.com"
	a.mail.mu.Lock()
	a.mail.err = errors.New("mail service unavailable")
	a.mail.mu.Unlock()
	a.req(c, "POST", "/api/v1/auth/register", fmt.Sprintf(`{"email":%q,"password":"password123","full_name":"Prueba"}`, email), 503)
	a.req(c, "GET", "/api/v1/auth/me", "", 401)
	a.mail.mu.Lock()
	a.mail.err = nil
	a.mail.mu.Unlock()
	a.req(c, "POST", "/api/v1/auth/resend-verification", fmt.Sprintf(`{"email":%q}`, email), 204)
	a.confirmAndLogin(c, email)
	a.req(c, "GET", "/api/v1/auth/me", "", 200)
}
