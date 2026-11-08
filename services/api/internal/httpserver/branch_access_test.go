package httpserver

import (
	"context"
	"fmt"
	"testing"

	"kilora/api/internal/database/sqlc"
)

func TestBranchAccess(t *testing.T) {
	a := newTestAPI(t)
	owner := a.client()
	path, workshop, north, _ := a.workshop(owner)
	south := a.branch(workshop)
	if _, err := a.q.CreateMembership(context.Background(), sqlc.CreateMembershipParams{UserID: mustUser(t, a, owner), WorkshopID: workshop, BranchID: south, Role: sqlc.MembershipRoleAdmin}); err != nil {
		t.Fatal(err)
	}
	vehicle := a.obj(owner, "POST", path+"/vehicles", `{"make":"Toyota","model":"Yaris"}`, 201)["id"].(string)
	newOrder := func(branch string) string {
		return a.obj(owner, "POST", path+"/work-orders", fmt.Sprintf(`{"vehicle_id":%q,"branch_id":%q,"reason":"Revisión"}`, vehicle, branch), 201)["id"].(string)
	}
	newQuote := func(branch string) string {
		body := fmt.Sprintf(`{"customer_name":"Ana","vehicle_model":"Yaris","branch_id":%q,"items":[{"kind":"repuesto","description":"Filtro","quantity":"1","unit_price":"10.00"}]}`, branch)
		return a.obj(owner, "POST", path+"/quotes", body, 201)["id"].(string)
	}
	northOrder, southOrder := newOrder(north.String()), newOrder(south.String())
	northQuote, southQuote := newQuote(north.String()), newQuote(south.String())

	t.Run("member only sees their branch", func(t *testing.T) {
		c := a.client()
		a.member(c, workshop, north, sqlc.MembershipRoleMecanico)
		a.req(c, "GET", path+"/work-orders/"+northOrder, "", 200)
		a.req(c, "GET", path+"/work-orders/"+southOrder, "", 404)
		a.req(c, "GET", path+"/quotes/"+northQuote, "", 200)
		a.req(c, "GET", path+"/quotes/"+southQuote, "", 404)
		orders := a.req(c, "GET", path+"/work-orders", "", 200).([]any)
		if len(orders) != 1 || orders[0].(map[string]any)["id"] != northOrder {
			t.Fatalf("órdenes visibles: %v", orders)
		}
		quotes := a.obj(c, "GET", path+"/quotes", "", 200)["items"].([]any)
		if len(quotes) != 1 || quotes[0].(map[string]any)["id"] != northQuote {
			t.Fatalf("cotizaciones visibles: %v", quotes)
		}
	})

	t.Run("mechanic cannot write in their own branch", func(t *testing.T) {
		c := a.client()
		a.member(c, workshop, north, sqlc.MembershipRoleMecanico)
		a.req(c, "PATCH", path+"/work-orders/"+northOrder+"/status", `{"status":"diagnostico"}`, 403)
		a.req(c, "POST", path+"/vehicles", `{"make":"x","model":"y"}`, 403)
	})

	t.Run("admin of one branch cannot touch another", func(t *testing.T) {
		c := a.client()
		a.member(c, workshop, north, sqlc.MembershipRoleAdmin)
		a.req(c, "PATCH", path+"/work-orders/"+northOrder, `{"public_notes":"ok"}`, 200)
		a.req(c, "PATCH", path+"/work-orders/"+southOrder, `{"public_notes":"no"}`, 404)
		a.req(c, "POST", path+"/work-orders", fmt.Sprintf(`{"vehicle_id":%q,"branch_id":%q,"reason":"x"}`, vehicle, south), 403)
		a.req(c, "POST", path+"/quotes/"+southQuote+"/convert", "", 404)
		a.req(c, "POST", path+"/members", fmt.Sprintf(`{"email":"nadie@example.com","branch_id":%q,"role":"mecanico"}`, south), 403)
	})

	t.Run("read-only branch stays read-only for a writer elsewhere", func(t *testing.T) {
		c := a.client()
		a.member(c, workshop, north, sqlc.MembershipRoleRecepcion)
		user := mustUser(t, a, c)
		if _, err := a.q.CreateMembership(context.Background(), sqlc.CreateMembershipParams{UserID: user, WorkshopID: workshop, BranchID: south, Role: sqlc.MembershipRoleMecanico}); err != nil {
			t.Fatal(err)
		}
		a.req(c, "PATCH", path+"/work-orders/"+southOrder, `{"public_notes":"no"}`, 403)
		a.req(c, "GET", path+"/work-orders/"+southOrder, "", 200)
	})
}
