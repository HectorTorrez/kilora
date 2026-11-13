package httpserver

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"kilora/api/internal/auth"
)

func TestAccountProfileAndPassword(t *testing.T) {
	a := newTestAPI(t)
	c, otherSession, stranger := a.client(), a.client(), a.client()
	id, email := a.register(c)
	otherID, _ := a.register(stranger)
	a.req(otherSession, "POST", "/api/v1/auth/login", fmt.Sprintf(`{"email":%q,"password":"password123"}`, email), 204)
	a.req(a.client(), "PATCH", "/api/v1/auth/me", `{"full_name":"Nuevo Nombre"}`, 401)
	a.req(c, "PATCH", "/api/v1/auth/me", `{"full_name":"!","phone":null}`, 400)
	a.req(c, "PATCH", "/api/v1/auth/me", `{"full_name":"Nuevo Nombre","phone":"invalid"}`, 400)
	a.req(c, "PATCH", "/api/v1/auth/me", `{"full_name":"  Nuevo Nombre  ","phone":"7777-8888"}`, 204)
	me := a.obj(c, "GET", "/api/v1/auth/me", "", 200)["user"].(map[string]any)
	if me["full_name"] != "Nuevo Nombre" || me["phone"] != "+50377778888" || me["email"] != email {
		t.Fatal(me)
	}
	other, err := a.q.GetUserByID(context.Background(), otherID)
	if err != nil || other.FullName != "Prueba" {
		t.Fatalf("other profile changed: %v", err)
	}
	a.req(c, "PATCH", "/api/v1/auth/me", `{"full_name":"Nuevo Nombre","phone":null}`, 204)
	a.req(c, "POST", "/api/v1/auth/change-password", `{"current_password":"wrong","password":"newpassword123"}`, 400)
	a.req(c, "POST", "/api/v1/auth/change-password", `{"current_password":"password123","password":"short"}`, 400)
	token, hash, err := auth.NewTokenPair()
	if err != nil {
		t.Fatal(err)
	}
	_, err = a.db.Exec(context.Background(), `INSERT INTO auth_token (token_hash,user_id,purpose,expires_at) VALUES ($1,$2,'reset_password',now()+interval '1 hour')`, hash, id)
	if err != nil {
		t.Fatal(err)
	}
	a.req(c, "POST", "/api/v1/auth/change-password", `{"current_password":"password123","password":"newpassword123"}`, 204)
	for _, client := range []*http.Client{c, otherSession} {
		a.req(client, "GET", "/api/v1/auth/me", "", 401)
	}
	a.req(c, "POST", "/api/v1/auth/login", fmt.Sprintf(`{"email":%q,"password":"password123"}`, email), 401)
	a.req(c, "POST", "/api/v1/auth/reset-password", fmt.Sprintf(`{"token":%q,"password":"oldreset123"}`, token), 400)
	a.req(c, "POST", "/api/v1/auth/login", fmt.Sprintf(`{"email":%q,"password":"newpassword123"}`, email), 204)
}

func TestAccountDeletionPreservesHistoryAndUnlinksVehicles(t *testing.T) {
	a := newTestAPI(t)
	ctx := context.Background()
	c := a.client()
	id, email := a.register(c)
	vehicle := a.obj(c, "POST", "/api/v1/me/vehicles", `{"make":"Toyota","model":"Corolla","year":2020,"plate":"P123456"}`, 201)
	path := "/api/v1/me/vehicles/" + vehicle["id"].(string)
	a.req(c, "POST", path+"/history", `{"performed_on":"2026-01-01","summary":"Cambio de aceite","items":[]}`, 201)
	a.req(c, "DELETE", "/api/v1/auth/me", `{"current_password":"wrong"}`, 400)
	a.req(c, "DELETE", "/api/v1/auth/me", `{"current_password":"password123"}`, 204)
	a.req(c, "GET", "/api/v1/auth/me", "", 401)
	a.req(c, "POST", "/api/v1/auth/login", fmt.Sprintf(`{"email":%q,"password":"password123"}`, email), 401)
	user, err := a.q.GetUserByID(ctx, id)
	if err != nil || user.FullName != "Cuenta eliminada" || user.Email == email || user.Phone != nil || user.PasswordHash != "" || user.EmailVerifiedAt.Valid {
		t.Fatalf("account not anonymized: %v", err)
	}
	var owner *string
	var count int
	if err = a.db.QueryRow(ctx, `SELECT owner_user_id::text FROM vehicle WHERE id=$1`, vehicle["id"]).Scan(&owner); err != nil || owner != nil {
		t.Fatalf("vehicle still linked: %v", err)
	}
	if err = a.db.QueryRow(ctx, `SELECT count(*) FROM history_record WHERE vehicle_id=$1`, vehicle["id"]).Scan(&count); err != nil || count != 1 {
		t.Fatalf("history lost: %v, %d", err, count)
	}
	a.req(c, "POST", "/api/v1/auth/register", fmt.Sprintf(`{"email":%q,"password":"password123","full_name":"Nueva Cuenta"}`, email), 201)
}

func TestAccountDeletionBlockedForWorkshopMembers(t *testing.T) {
	a := newTestAPI(t)
	c := a.client()
	a.workshop(c)
	a.req(c, "DELETE", "/api/v1/auth/me", `{"current_password":"password123"}`, 409)
	a.req(c, "GET", "/api/v1/auth/me", "", 200)
}

func TestDemoAccountCannotBeModified(t *testing.T) {
	a := newTestAPI(t)
	c := a.client()
	id, _ := a.register(c)
	email := "account-" + id.String() + "@demo.kilora.app"
	if _, err := a.db.Exec(context.Background(), `UPDATE app_user SET email=$1 WHERE id=$2`, email, id); err != nil {
		t.Fatal(err)
	}
	a.req(c, "PATCH", "/api/v1/auth/me", `{"full_name":"Nuevo Nombre","phone":null}`, 403)
	a.req(c, "POST", "/api/v1/auth/change-password", `{"current_password":"password123","password":"newpassword123"}`, 403)
	a.req(c, "DELETE", "/api/v1/auth/me", `{"current_password":"password123"}`, 403)
}
