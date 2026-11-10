package httpserver

import (
	"context"
	"testing"

	"kilora/api/internal/database/sqlc"
)

func TestUpdateWorkshop(t *testing.T) {
	api := newTestAPI(t)
	admin, reception, outsider := api.client(), api.client(), api.client()
	path, id, branch, _ := api.workshop(admin)
	api.member(reception, id, branch, sqlc.MembershipRoleRecepcion)
	otherPath, _, _, _ := api.workshop(outsider)

	api.req(reception, "PATCH", path+"/", `{"name":"Otro nombre"}`, 403)
	api.req(outsider, "PATCH", path+"/", `{"name":"Otro nombre"}`, 403)
	api.req(admin, "PATCH", path+"/", `{"name":"  "}`, 400)
	api.req(admin, "PATCH", path+"/", `{"name":"Taller","nit":"123"}`, 400)

	by := "soporte"
	if _, err := api.q.VerifyWorkshop(context.Background(), sqlc.VerifyWorkshopParams{WorkshopID: id, VerifiedBy: &by}); err != nil {
		t.Fatal(err)
	}
	same := api.obj(admin, "PATCH", path+"/", `{"name":"Taller","nit":null}`, 200)
	if same["verified_at"] == nil {
		t.Fatal("guardar sin cambios no debe quitar la verificación", same)
	}
	updated := api.obj(admin, "PATCH", path+"/", `{"name":" Taller Volcanes ","nit":"0614-010190-101-1"}`, 200)
	if updated["name"] != "Taller Volcanes" || updated["nit"] != "0614-010190-101-1" || updated["verified_at"] != nil {
		t.Fatal(updated)
	}
	got := api.obj(reception, "GET", path+"/", "", 200)["workshop"].(map[string]any)
	if got["name"] != "Taller Volcanes" {
		t.Fatal(got)
	}
	events := api.req(admin, "GET", path+"/audit?limit=1", "", 200).([]any)
	if events[0].(map[string]any)["action"] != "workshop.update" {
		t.Fatal(events)
	}
	if api.obj(outsider, "GET", otherPath+"/", "", 200)["workshop"].(map[string]any)["name"] != "Taller" {
		t.Fatal("se modificó otro taller")
	}
}
