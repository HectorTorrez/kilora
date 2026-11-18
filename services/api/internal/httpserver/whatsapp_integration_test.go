package httpserver

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/notifications"
)

type fakeWhatsApp struct {
	mu    sync.Mutex
	calls int
	byURL map[string]int
	err   error
}

func (f *fakeWhatsApp) Send(ctx context.Context, kind, to string, params []string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	if f.byURL == nil {
		f.byURL = map[string]int{}
	}
	f.byURL[params[1]]++
	return "wamid.test", f.err
}

func TestWhatsAppQueueLifecycle(t *testing.T) {
	ctx := context.Background()
	a := newTestAPIWithWhatsApp(t, notifications.Config{APIKey: "test", PhoneNumberID: "123", Language: "es", TrackingTemplate: "tracking", QuoteTemplate: "quote", InvitationTemplate: "invitation"})
	staff := a.client()
	path, workshop, branch, _ := a.workshop(staff)
	t.Cleanup(func() { a.db.Exec(ctx, `DELETE FROM whatsapp_notification WHERE workshop_id=$1`, workshop) })
	vehicle := a.obj(staff, "POST", path+"/vehicles", `{"make":"Toyota","model":"Yaris","customer":{"full_name":"Ana","phone":"7100-0009"}}`, 201)["id"].(string)
	order := a.obj(staff, "POST", path+"/work-orders", fmt.Sprintf(`{"vehicle_id":%q,"branch_id":%q,"reason":"Revisión"}`, vehicle, branch), 201)["id"].(string)
	tracking := path + "/work-orders/" + order + "/tracking/share"
	endpoint := path + "/whatsapp-notifications"
	newLink := func() string { return a.obj(staff, "POST", tracking, "", 201)["url"].(string) }
	enqueue := func(link string) map[string]any {
		return a.obj(staff, "POST", endpoint, fmt.Sprintf(`{"url":%q}`, link), 202)
	}
	link := newLink()
	n := enqueue(link)
	duplicate := enqueue(link)
	if n["id"] != duplicate["id"] {
		t.Fatal("duplicate notification")
	}
	// A writer from another branch and a mechanic cannot send this link.
	other := a.client()
	a.member(other, workshop, a.branch(workshop), sqlc.MembershipRoleRecepcion)
	a.req(other, "POST", endpoint, fmt.Sprintf(`{"url":%q}`, link), 403)
	a.req(other, "GET", endpoint+"/"+n["id"].(string), "", 404)
	mechanic := a.client()
	a.member(mechanic, workshop, branch, sqlc.MembershipRoleMecanico)
	a.req(mechanic, "POST", endpoint, fmt.Sprintf(`{"url":%q}`, link), 403)
	outsider := a.client()
	a.workshop(outsider)
	a.req(outsider, "POST", endpoint, fmt.Sprintf(`{"url":%q}`, link), 403)
	sender := &fakeWhatsApp{}
	var wg sync.WaitGroup
	for range 2 {
		wg.Go(func() {
			if err := notifications.Process(ctx, a.db, sender); err != nil {
				t.Error(err)
			}
		})
	}
	wg.Wait()
	if sender.byURL[link] != 1 {
		t.Fatalf("sent %d copies of one notification", sender.byURL[link])
	}
	state := a.obj(staff, "GET", endpoint+"/"+n["id"].(string), "", 200)
	if state["status"] != "accepted" {
		t.Fatal(state)
	}
	var recipient string
	var parameters []byte
	if err := a.db.QueryRow(ctx, `SELECT recipient,parameters FROM whatsapp_notification WHERE id=$1`, n["id"]).Scan(&recipient, &parameters); err != nil || recipient != "" || string(parameters) != "[]" {
		t.Fatalf("retained payload: %s %s %v", recipient, parameters, err)
	}
	for _, tc := range []struct {
		name    string
		sendErr error
		want    string
		revoke  bool
	}{
		{"revoked", nil, "cancelled", true},
		{"ambiguous", &notifications.SendError{Code: "transport_error", Uncertain: true}, "unknown", false},
		{"rejected", &notifications.SendError{Code: "http_400"}, "failed", false},
		{"rate limited", &notifications.SendError{Code: "http_429", Retry: true}, "queued", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			n := enqueue(newLink())
			if tc.revoke {
				a.req(staff, "DELETE", tracking, "", 204)
			}
			sender.err = tc.sendErr
			if err := notifications.Process(ctx, a.db, sender); err != nil {
				t.Fatal(err)
			}
			state := a.obj(staff, "GET", endpoint+"/"+n["id"].(string), "", 200)
			if state["status"] != tc.want {
				t.Fatal(state)
			}
			if tc.want == "queued" {
				var available time.Time
				a.db.QueryRow(ctx, `SELECT available_at FROM whatsapp_notification WHERE id=$1`, n["id"]).Scan(&available)
				if !available.After(time.Now()) {
					t.Fatal("retry has no backoff")
				}
			}
		})
	}
	// Counter quotes and owner invitations resolve recipients from server data too.
	quote := a.obj(staff, "POST", path+"/quotes", fmt.Sprintf(`{"branch_id":%q,"customer_name":"Ana","customer_phone":"7100-0010","vehicle_model":"Yaris","items":[{"kind":"mano_de_obra","description":"Revisión","quantity":"1","unit_price":"10"}]}`, branch), 201)["id"].(string)
	qLink := a.obj(staff, "POST", path+"/quotes/"+quote+"/share", "", 200)["url"].(string)
	enqueue(qLink)
	iLink := a.obj(staff, "POST", path+"/vehicles/"+vehicle+"/invitations", `{"email":"owner@example.com"}`, 201)["url"].(string)
	enqueue(iLink)
	sender.err = nil
	if err := notifications.Process(ctx, a.db, sender); err != nil {
		t.Fatal(err)
	}
	if sender.byURL[qLink] != 1 || sender.byURL[iLink] != 1 {
		t.Fatal("quote or invitation not sent")
	}
	// A process crash after claiming a row leaves an uncertain outcome, never a resend.
	stale := enqueue(newLink())
	if _, err := a.db.Exec(ctx, `UPDATE whatsapp_notification SET status='sending',updated_at=now()-interval '3 minutes' WHERE id=$1`, stale["id"]); err != nil {
		t.Fatal(err)
	}
	if err := notifications.Process(ctx, a.db, sender); err != nil {
		t.Fatal(err)
	}
	if state := a.obj(staff, "GET", endpoint+"/"+stale["id"].(string), "", 200); state["status"] != "unknown" {
		t.Fatal(state)
	}
}
func TestWhatsAppDisabled(t *testing.T) {
	a := newTestAPI(t)
	staff := a.client()
	path, _, _, _ := a.workshop(staff)
	config := a.obj(staff, "GET", path+"/whatsapp-notifications/config", "", 200)
	if config["quote"] != false || config["tracking"] != false || config["invitation"] != false {
		t.Fatal(config)
	}
	a.req(staff, "POST", path+"/whatsapp-notifications", fmt.Sprintf(`{"url":%q}`, testOrigin+"/estado/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), 503)
}
