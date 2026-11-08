package httpserver

import (
	"context"
	"fmt"
	"github.com/google/uuid"
	"net/http"
	"strings"
	"sync"
	"testing"
)

type fakeMailer struct {
	mu     sync.Mutex
	bodies []string
}

func (m *fakeMailer) Send(_ context.Context, _, _, body string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.bodies = append(m.bodies, body)
	return nil
}
func TestAuthAndWorkshops(t *testing.T) {
	api := newTestAPI(t)
	mailer := api.mail
	client, request := api.client, api.obj
	a, b := client(), client()
	email := uuid.NewString() + "@example.com"
	register := func(c *http.Client, email string) {
		request(c, "POST", "/api/v1/auth/register", fmt.Sprintf(`{"email":%q,"password":"password123","full_name":"Prueba"}`, email), 201)
	}
	register(a, email)
	request(a, "GET", "/api/v1/auth/me", "", 200)
	request(a, "POST", "/api/v1/auth/logout", "", 204)
	request(a, "GET", "/api/v1/auth/me", "", 401)
	request(a, "POST", "/api/v1/auth/login", fmt.Sprintf(`{"email":%q,"password":"incorrecta"}`, email), 401)
	request(a, "POST", "/api/v1/auth/login", fmt.Sprintf(`{"email":%q,"password":"password123"}`, email), 204)
	workshop := request(a, "POST", "/api/v1/workshops", `{"name":"Taller","branch_name":"Principal"}`, 201)
	path := "/api/v1/workshops/" + workshop["id"].(string)
	request(a, "GET", path, "", 200)
	register(b, uuid.NewString()+"@example.com")
	request(b, "GET", path, "", 403)
	request(a, "POST", "/api/v1/auth/forgot-password", fmt.Sprintf(`{"email":%q}`, email), 204)
	mailer.mu.Lock()
	body := mailer.bodies[len(mailer.bodies)-1]
	mailer.mu.Unlock()
	token := strings.Split(body, "token=")[1]
	request(b, "POST", "/api/v1/auth/reset-password", fmt.Sprintf(`{"token":%q,"password":"nueva1234"}`, token), 204)
	request(a, "GET", "/api/v1/auth/me", "", 401)
	request(a, "POST", "/api/v1/auth/reset-password", fmt.Sprintf(`{"token":%q,"password":"nueva1234"}`, token), 400)
	request(a, "POST", "/api/v1/auth/login", fmt.Sprintf(`{"email":%q,"password":"nueva1234"}`, email), 204)
}
