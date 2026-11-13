package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/values"
)

func maintenanceItem(t *testing.T, plan map[string]any, category string) map[string]any {
	t.Helper()
	for _, raw := range plan["items"].([]any) {
		item := raw.(map[string]any)
		if item["category"] == category {
			return item
		}
	}
	t.Fatalf("missing category %s", category)
	return nil
}

func TestOwnerMaintenancePlanAndPreferences(t *testing.T) {
	api := newTestAPI(t)
	owner, other, anonymous := api.client(), api.client(), api.client()
	api.register(owner)
	api.register(other)
	v := api.obj(owner, "POST", "/api/v1/me/vehicles", `{"make":"Toyota","model":"Corolla"}`, 201)
	path := "/api/v1/me/vehicles/" + v["id"].(string)
	endpoint := path + "/maintenance"
	plan := api.obj(owner, "GET", endpoint, "", 200)
	if plan["email_reminders"] != false || plan["odometer_stale"] != true || len(plan["items"].([]any)) != 9 {
		t.Fatalf("default plan: %+v", plan)
	}
	for _, raw := range plan["items"].([]any) {
		item := raw.(map[string]any)
		if item["status"] != "sin_historial" || item["due_date"] != nil || item["due_km"] != nil {
			t.Fatalf("invented dates: %+v", item)
		}
	}
	api.req(anonymous, "GET", endpoint, "", http.StatusUnauthorized)
	for _, method := range []string{"GET", "PATCH"} {
		body := ""
		if method == "PATCH" {
			body = `{"email_reminders":true}`
		}
		api.req(other, method, endpoint, body, 404)
	}
	api.req(other, "PUT", endpoint+"/intervals/aceite", `{"km":10000,"months":12}`, 404)
	api.req(other, "DELETE", endpoint+"/intervals/aceite", "", 404)
	api.req(owner, "PATCH", endpoint, `{}`, 400)
	for _, body := range []string{`{"km":0,"months":0}`, `{"km":-1,"months":12}`, `{"km":1000001}`, `{"months":121}`, `{"km":1.5}`} {
		api.req(owner, "PUT", endpoint+"/intervals/aceite", body, 400)
	}
	api.req(owner, "PUT", endpoint+"/intervals/inventado", `{"km":1000}`, 400)
	api.req(owner, "PATCH", endpoint, `{"email_reminders":true}`, 204)
	api.req(owner, "PUT", endpoint+"/intervals/aceite", `{"km":10000,"months":12}`, 204)
	performed := values.Today().AddDate(0, -1, 0).Format(time.DateOnly)
	rec := api.obj(owner, "POST", path+"/history", fmt.Sprintf(`{"performed_on":%q,"summary":"Cambio de aceite","odometer_km":40000}`, performed), 201)
	api.req(owner, "POST", path+"/odometer", `{"km":42000}`, 201)
	plan = api.obj(owner, "GET", endpoint, "", 200)
	oil := maintenanceItem(t, plan, "aceite")
	if plan["email_reminders"] != true || oil["due_km"] != float64(50000) || oil["status"] != "programado" || oil["custom_interval"] != true {
		t.Fatalf("custom plan: %+v", plan)
	}
	api.req(owner, "POST", path+"/history", fmt.Sprintf(`{"performed_on":%q,"summary":"Cambio de batería"}`, performed), 201)
	api.req(owner, "PUT", endpoint+"/intervals/bateria", `{"km":50000,"months":0}`, 204)
	noMileage := maintenanceItem(t, api.obj(owner, "GET", endpoint, "", 200), "bateria")
	if noMileage["status"] != "sin_kilometraje" || noMileage["due_date"] != nil || noMileage["due_km"] != nil {
		t.Fatalf("missing mileage: %+v", noMileage)
	}
	// Corrections must change the forecast without rewriting the source history.
	api.req(owner, "POST", path+"/corrections", fmt.Sprintf(`{"history_record_id":%q,"reason":"Kilometraje corregido","changes":{"odometer_km":41000}}`, rec["id"]), 201)
	plan = api.obj(owner, "GET", endpoint, "", 200)
	if got := maintenanceItem(t, plan, "aceite")["due_km"]; got != float64(51000) {
		t.Fatalf("correction ignored: %v", got)
	}
	api.req(owner, "DELETE", endpoint+"/intervals/aceite", "", 204)
	api.req(owner, "PATCH", endpoint, `{"email_reminders":false}`, 204)
	plan = api.obj(owner, "GET", endpoint, "", 200)
	oil = maintenanceItem(t, plan, "aceite")
	if plan["email_reminders"] != false || oil["custom_interval"] != false || oil["due_km"] != float64(46000) {
		t.Fatalf("reset: %+v", plan)
	}
}

func TestMaintenanceReminderDelivery(t *testing.T) {
	api := newTestAPI(t)
	owner := api.client()
	user, _ := api.register(owner)
	v := api.obj(owner, "POST", "/api/v1/me/vehicles", `{"make":"Toyota","model":"Corolla"}`, 201)
	id := uuid.MustParse(v["id"].(string))
	path := "/api/v1/me/vehicles/" + id.String()
	now := values.Today()
	performed := now.AddDate(0, -7, 0).Format(time.DateOnly)
	api.req(owner, "POST", path+"/history", fmt.Sprintf(`{"performed_on":%q,"summary":"Cambio de aceite","odometer_km":40000}`, performed), 201)
	s := &server{db: api.db, mailer: api.mail, origin: testOrigin}
	ctx := context.Background()
	count := func() int { api.mail.mu.Lock(); defer api.mail.mu.Unlock(); return len(api.mail.bodies) }
	start := count()
	if err := s.sendMaintenanceReminder(ctx, id, now); err != nil {
		t.Fatal(err)
	}
	if count() != start {
		t.Fatal("sent without consent")
	}
	api.req(owner, "PATCH", path+"/maintenance", `{"email_reminders":true}`, 204)
	// Failed delivery remains eligible for retry.
	api.mail.err = errors.New("mail unavailable")
	if err := s.sendMaintenanceReminder(ctx, id, now); err == nil {
		t.Fatal("expected mail failure")
	}
	prefs, err := api.q.GetOwnerMaintenance(ctx, sqlc.GetOwnerMaintenanceParams{VehicleID: id, OwnerUserID: &user})
	if err != nil || prefs.LastSentAt.Valid {
		t.Fatalf("failure recorded as delivery: %+v %v", prefs, err)
	}
	api.mail.err = nil
	// Two API replicas must not both send this vehicle's digest.
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for range 2 {
		wg.Go(func() { errs <- s.sendMaintenanceReminder(ctx, id, now) })
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if count() != start+1 {
		t.Fatalf("duplicate send: %d", count()-start)
	}
	api.mail.mu.Lock()
	body := api.mail.bodies[len(api.mail.bodies)-1]
	api.mail.mu.Unlock()
	if !strings.Contains(body, "aceite") || !strings.Contains(body, testOrigin+"/mis-vehiculos/"+id.String()) || strings.Contains(body, "internal") {
		t.Fatal(body)
	}
	if err := s.sendMaintenanceReminder(ctx, id, now.AddDate(0, 0, 6)); err != nil {
		t.Fatal(err)
	}
	if count() != start+1 {
		t.Fatal("weekly limit ignored")
	}
	if err := s.sendMaintenanceReminder(ctx, id, now.AddDate(0, 0, 7)); err != nil {
		t.Fatal(err)
	}
	if count() != start+2 {
		t.Fatal("weekly digest not sent")
	}
	// Recording new maintenance should remove the old overdue reminder.
	api.req(owner, "POST", path+"/history", fmt.Sprintf(`{"performed_on":%q,"summary":"Cambio de aceite","odometer_km":45000}`, now.Format(time.DateOnly)), 201)
	if err := s.sendMaintenanceReminder(ctx, id, now.AddDate(0, 0, 14)); err != nil {
		t.Fatal(err)
	}
	if count() != start+2 {
		t.Fatal("old work still triggers reminders")
	}
	api.req(owner, "PATCH", path+"/maintenance", `{"email_reminders":false}`, 204)
	if err := s.sendMaintenanceReminder(ctx, id, now.AddDate(1, 0, 0)); err != nil {
		t.Fatal(err)
	}
	if count() != start+2 {
		t.Fatal("sent after opt-out")
	}
}

func TestMaintenanceMileageReminderAndEligibility(t *testing.T) {
	api := newTestAPI(t)
	owner := api.client()
	user, _ := api.register(owner)
	v := api.obj(owner, "POST", "/api/v1/me/vehicles", `{"make":"Kia","model":"Rio"}`, 201)
	id := uuid.MustParse(v["id"].(string))
	api.req(owner, "PATCH", "/api/v1/me/vehicles/"+id.String()+"/maintenance", `{"email_reminders":true}`, 204)
	ctx := context.Background()
	now := values.Today()
	mail := &fakeMailer{}
	s := &server{db: api.db, mailer: mail, origin: testOrigin}
	send := func(at time.Time, want int) {
		t.Helper()
		if err := s.sendMaintenanceReminder(ctx, id, at); err != nil {
			t.Fatal(err)
		}
		if len(mail.bodies) != want {
			t.Fatalf("sent %d, want %d", len(mail.bodies), want)
		}
	}
	send(now, 1)
	send(now.AddDate(0, 0, 7), 1)
	send(now.AddDate(0, 0, 30), 2)
	if _, err := api.db.Exec(ctx, "UPDATE app_user SET email_verified_at = NULL WHERE id = $1", user); err != nil {
		t.Fatal(err)
	}
	send(now.AddDate(0, 0, 61), 2)
	if _, err := api.db.Exec(ctx, "UPDATE app_user SET email_verified_at = now() WHERE id = $1", user); err != nil {
		t.Fatal(err)
	}
	if _, err := api.db.Exec(ctx, "UPDATE vehicle SET status = 'archivado', archived_at = now() WHERE id = $1", id); err != nil {
		t.Fatal(err)
	}
	send(now.AddDate(0, 0, 61), 2)
	if _, err := api.db.Exec(ctx, "UPDATE vehicle SET status = 'vinculado', owner_user_id = NULL WHERE id = $1", id); err != nil {
		t.Fatal(err)
	}
	send(now.AddDate(0, 0, 61), 2)
}

func TestMaintenanceReminderUsesOwnerProjection(t *testing.T) {
	api := newTestAPI(t)
	owner := api.client()
	user, _ := api.register(owner)
	ctx := context.Background()
	v, err := api.q.CreateVehicle(ctx, sqlc.CreateVehicleParams{OwnerUserID: &user, Status: sqlc.VehicleStatusVinculado, Make: "Toyota", Model: "Corolla"})
	if err != nil {
		t.Fatal(err)
	}
	staff := api.client()
	_, workshop, _, _ := api.workshop(staff)
	items, _ := json.Marshal([]map[string]any{{"description": "Cambio de aceite", "category": "aceite", "internal_cost": "SECRETO", "mechanic_notes": "SECRETO"}})
	if _, err = api.q.CreateHistoryRecord(ctx, sqlc.CreateHistoryRecordParams{VehicleID: v.ID, WorkshopID: &workshop, Source: sqlc.HistorySourceTaller, PerformedOn: date(values.Today().AddDate(0, -7, 0)), Summary: "Cambio de aceite", Items: items, Currency: "USD"}); err != nil {
		t.Fatal(err)
	}
	raw := api.raw(owner, "GET", "/api/v1/me/vehicles/"+v.ID.String()+"/maintenance", "", 200)
	if strings.Contains(string(raw), "SECRETO") {
		t.Fatal(string(raw))
	}
	var plan ownerMaintenancePlan
	if err := json.Unmarshal(raw, &plan); err != nil {
		t.Fatal(err)
	}
	body, send := maintenanceReminderBody(plan, "Toyota Corolla", testOrigin)
	if !send || strings.Contains(body, "SECRETO") {
		t.Fatal(body)
	}
}

func TestOwnerMaintenanceUsesElSalvadorDate(t *testing.T) {
	api := newTestAPI(t)
	owner := api.client()
	user, _ := api.register(owner)
	v := api.obj(owner, "POST", "/api/v1/me/vehicles", `{"make":"Toyota","model":"Corolla"}`, 201)
	id := uuid.MustParse(v["id"].(string))
	api.req(owner, "POST", "/api/v1/me/vehicles/"+id.String()+"/history", `{"performed_on":"2026-05-20","summary":"Cambio de aceite"}`, 201)
	for _, tt := range []struct{ at, status string }{
		{"2026-11-20T04:00:00Z", "proximo"},
		{"2026-11-20T06:00:00Z", "vencido"},
	} {
		at, _ := time.Parse(time.RFC3339, tt.at)
		plan, err := loadOwnerMaintenance(context.Background(), api.q, id, user, at)
		if err != nil {
			t.Fatal(err)
		}
		if plan.Items[0].Status != tt.status {
			t.Fatalf("%s: %+v", tt.at, plan.Items[0])
		}
	}
}
