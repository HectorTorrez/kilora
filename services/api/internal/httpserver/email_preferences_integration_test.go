package httpserver

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"kilora/api/internal/database/sqlc"
)

func TestAccountEmailPreferences(t *testing.T) {
	api := newTestAPI(t)
	owner, other := api.client(), api.client()
	_, email := api.register(owner)
	api.register(other)
	endpoint := "/api/v1/auth/me/email-preferences"
	api.req(api.client(), "PATCH", endpoint, `{"maintenance_emails_enabled":false}`, 401)
	api.req(owner, "PATCH", endpoint, `{}`, 400)
	api.req(owner, "PATCH", endpoint, `{"maintenance_emails_enabled":null}`, 400)
	api.req(owner, "PATCH", endpoint, `{"maintenance_emails_enabled":"no"}`, 400)
	for _, enabled := range []bool{false, true, false} {
		api.req(owner, "PATCH", endpoint, fmt.Sprintf(`{"maintenance_emails_enabled":%t}`, enabled), 204)
		user := api.obj(owner, "GET", "/api/v1/auth/me", "", 200)["user"].(map[string]any)
		if user["maintenance_emails_enabled"] != enabled {
			t.Fatalf("preference not persisted: %+v", user)
		}
	}
	otherUser := api.obj(other, "GET", "/api/v1/auth/me", "", 200)["user"].(map[string]any)
	if otherUser["maintenance_emails_enabled"] != true {
		t.Fatal("changed another account's preference")
	}
	// A new session must see the saved preference, while authentication emails
	// and the normal profile update remain independent of maintenance consent.
	api.req(owner, "PATCH", "/api/v1/auth/me", `{"full_name":"Propietario Prueba","phone":null}`, 204)
	second := api.client()
	api.req(second, "POST", "/api/v1/auth/login", fmt.Sprintf(`{"email":%q,"password":"password123"}`, email), 204)
	if user := api.obj(second, "GET", "/api/v1/auth/me", "", 200)["user"].(map[string]any); user["maintenance_emails_enabled"] != false {
		t.Fatal(user)
	}
	id := api.obj(owner, "GET", "/api/v1/auth/me", "", 200)["user"].(map[string]any)["id"]
	if _, err := api.db.Exec(context.Background(), `UPDATE app_user SET email = $1 WHERE id = $2`, "account-"+id.(string)+"@demo.kilora.app", id); err != nil {
		t.Fatal(err)
	}
	api.req(owner, "PATCH", endpoint, `{"maintenance_emails_enabled":true}`, 403)
}

func TestAccountEmailPreferenceBlocksAllVehicleReminders(t *testing.T) {
	api := newTestAPI(t)
	owner := api.client()
	api.register(owner)
	ctx := context.Background()
	now := time.Now()
	var vehicles []uuid.UUID
	for range 2 {
		v := api.obj(owner, "POST", "/api/v1/me/vehicles", `{"make":"Toyota","model":"Corolla"}`, 201)
		id := uuid.MustParse(v["id"].(string))
		vehicles = append(vehicles, id)
		api.req(owner, "PATCH", "/api/v1/me/vehicles/"+id.String()+"/maintenance", `{"email_reminders":true}`, 204)
	}
	endpoint := "/api/v1/auth/me/email-preferences"
	api.req(owner, "PATCH", endpoint, `{"maintenance_emails_enabled":false}`, 204)
	mail := &fakeMailer{}
	s := &server{db: api.db, mailer: mail, origin: testOrigin}
	eligible := func(id uuid.UUID) bool {
		t.Helper()
		ids, err := api.q.ListMaintenanceReminderVehicles(ctx, timestamptz(now.AddDate(0, 0, -7)))
		if err != nil {
			t.Fatal(err)
		}
		for _, candidate := range ids {
			if candidate == id {
				return true
			}
		}
		return false
	}
	for _, id := range vehicles {
		if eligible(id) {
			t.Fatal("global opt-out ignored by scheduler")
		}
		if err := s.sendMaintenanceReminder(ctx, id, now); err != nil {
			t.Fatal(err)
		}
		plan := api.obj(owner, "GET", "/api/v1/me/vehicles/"+id.String()+"/maintenance", "", 200)
		if plan["email_reminders"] != true {
			t.Fatal("vehicle selection lost")
		}
	}
	if len(mail.bodies) != 0 {
		t.Fatal("sent despite global opt-out")
	}
	api.req(owner, "PATCH", endpoint, `{"maintenance_emails_enabled":true}`, 204)
	for _, id := range vehicles {
		if !eligible(id) {
			t.Fatal("preference did not resume selected vehicles")
		}
		if err := s.sendMaintenanceReminder(ctx, id, now); err != nil {
			t.Fatal(err)
		}
	}
	if len(mail.bodies) != 2 {
		t.Fatalf("sent %d, want 2", len(mail.bodies))
	}
	api.req(owner, "PATCH", endpoint, `{"maintenance_emails_enabled":false}`, 204)
	for _, id := range vehicles {
		if err := s.sendMaintenanceReminder(ctx, id, now.AddDate(0, 0, 31)); err != nil {
			t.Fatal(err)
		}
	}
	if len(mail.bodies) != 2 {
		t.Fatal("sent after disabling account preference again")
	}
}

func TestDemoAccountsHaveEmailDisabledAndCannotOptIn(t *testing.T) {
	api := newTestAPI(t)
	ctx := context.Background()
	created, err := api.q.CreateUser(ctx, sqlc.CreateUserParams{Email: "fresh-" + uuid.NewString() + "@demo.kilora.app", FullName: "Cuenta Demo", PasswordHash: "unused"})
	if err != nil {
		t.Fatal(err)
	}
	if created.MaintenanceEmailsEnabled {
		t.Fatal("new demo user allows maintenance email")
	}
	owner := api.client()
	user, _ := api.register(owner)
	v := api.obj(owner, "POST", "/api/v1/me/vehicles", `{"make":"Toyota","model":"Corolla"}`, 201)
	id := uuid.MustParse(v["id"].(string))
	// Simulate an older demo account with incorrectly enabled flags. Both the
	// profile and the delivery boundary must still treat it as opted out.
	api.req(owner, "PATCH", "/api/v1/me/vehicles/"+id.String()+"/maintenance", `{"email_reminders":true}`, 204)
	if _, err := api.db.Exec(ctx, `UPDATE app_user SET email=$1, maintenance_emails_enabled=true WHERE id=$2`, "legacy-"+user.String()+"@demo.kilora.app", user); err != nil {
		t.Fatal(err)
	}
	me := api.obj(owner, "GET", "/api/v1/auth/me", "", 200)["user"].(map[string]any)
	if me["maintenance_emails_enabled"] != false {
		t.Fatal("demo switch shown as enabled")
	}
	api.req(owner, "PATCH", "/api/v1/auth/me/email-preferences", `{"maintenance_emails_enabled":true}`, 403)
	api.req(owner, "PATCH", "/api/v1/me/vehicles/"+id.String()+"/maintenance", `{"email_reminders":true}`, 403)
	candidates, err := api.q.ListMaintenanceReminderVehicles(ctx, timestamptz(time.Now()))
	if err != nil {
		t.Fatal(err)
	}
	for _, candidate := range candidates {
		if candidate == id {
			t.Fatal("demo included in scheduled deliveries")
		}
	}
	mail := &fakeMailer{}
	s := &server{db: api.db, mailer: mail, origin: testOrigin}
	if err := s.sendMaintenanceReminder(ctx, id, time.Now()); err != nil {
		t.Fatal(err)
	}
	if len(mail.bodies) != 0 {
		t.Fatal("demo received a maintenance email")
	}
}
