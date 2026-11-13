package httpserver

import (
	"context"
	"encoding/json"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"kilora/api/internal/database/sqlc"
)

func TestOwnerHistorySearchAcrossAllPages(t *testing.T) {
	api := newTestAPI(t)
	owner, other := api.client(), api.client()
	user, _ := api.register(owner)
	api.register(other)
	vehicle := api.obj(owner, "POST", "/api/v1/me/vehicles", `{"make":"Toyota","model":"Corolla"}`, 201)
	id := uuid.MustParse(vehicle["id"].(string))
	endpoint := "/api/v1/me/vehicles/" + id.String() + "/history"
	ctx := context.Background()
	ptr := func(value string) *string { return &value }
	create := func(on, summary string, workshop *uuid.UUID, notes *string, items string) uuid.UUID {
		t.Helper()
		d, _ := time.Parse(time.DateOnly, on)
		source := sqlc.HistorySourcePropietario
		if workshop != nil {
			source = sqlc.HistorySourceTaller
		}
		rec, err := api.q.CreateHistoryRecord(ctx, sqlc.CreateHistoryRecordParams{VehicleID: id, WorkshopID: workshop, Source: source, PerformedOn: date(d), Summary: summary, Items: []byte(items), WorkshopNotes: notes, CreatedBy: &user, Currency: "USD", InternalNotes: ptr("secreto-interno")})
		if err != nil {
			t.Fatal(err)
		}
		return rec.ID
	}
	for range 123 {
		create("2026-06-01", "Servicio rutinario", nil, nil, "[]")
	}
	latest := create("2024-12-31", "Cambio de batería", nil, ptr("Realizado en: Taller El Árbol"), "[]")
	oldest := create("2024-12-30", "Cambio de batería", nil, ptr("Realizado en: Taller El Árbol"), "[]")
	first := api.obj(owner, "GET", endpoint+"?limit=10", "", 200)
	if first["total"] != float64(125) || len(first["records"].([]any)) != 10 {
		t.Fatal(first)
	}
	query := url.Values{"q": {"BATERIA"}, "category": {"bateria"}, "workshop": {"TALLER EL ARBOL"}, "from": {"2024-12-30"}, "to": {"2024-12-31"}, "limit": {"1"}}
	result := api.obj(owner, "GET", endpoint+"?"+query.Encode(), "", 200)
	if result["total"] != float64(2) || result["unfiltered_total"] != float64(125) || result["records"].([]any)[0].(map[string]any)["id"] != latest.String() {
		t.Fatal(result)
	}
	query.Set("offset", "1")
	result = api.obj(owner, "GET", endpoint+"?"+query.Encode(), "", 200)
	if result["total"] != float64(2) || result["records"].([]any)[0].(map[string]any)["id"] != oldest.String() {
		t.Fatal(result)
	}
	query.Set("offset", "1000")
	result = api.obj(owner, "GET", endpoint+"?"+query.Encode(), "", 200)
	if result["total"] != float64(2) || len(result["records"].([]any)) != 0 {
		t.Fatal(result)
	}
	zero := api.obj(owner, "GET", endpoint+"?q=no-existe", "", 200)
	if zero["total"] != float64(0) || len(zero["workshops"].([]any)) != 1 || zero["workshops"].([]any)[0] != "Taller El Árbol" {
		t.Fatal(zero)
	}
	// Filters are scoped to the same vehicle ownership checks as the history.
	api.req(other, "GET", endpoint+"?q=bateria", "", 404)
	api.req(api.client(), "GET", endpoint+"?q=bateria", "", 401)
	for _, q := range []string{"category=invalid", "from=2026-02-30", "from=2026-02-01&to=2026-01-01", "q=" + strings.Repeat("x", 201)} {
		api.req(owner, "GET", endpoint+"?"+q, "", 400)
	}
}

func TestOwnerHistorySearchCorrectionsAndWorkshopPrivacy(t *testing.T) {
	api := newTestAPI(t)
	owner := api.client()
	user, _ := api.register(owner)
	staff := api.client()
	_, workshop, _, _ := api.workshop(staff)
	vehicle := api.obj(owner, "POST", "/api/v1/me/vehicles", `{"make":"Kia","model":"Rio"}`, 201)
	id := uuid.MustParse(vehicle["id"].(string))
	endpoint := "/api/v1/me/vehicles/" + id.String() + "/history"
	ctx := context.Background()
	d, _ := time.Parse(time.DateOnly, "2026-01-10")
	private := "secreto-interno"
	rec, err := api.q.CreateHistoryRecord(ctx, sqlc.CreateHistoryRecordParams{VehicleID: id, WorkshopID: &workshop, Source: sqlc.HistorySourceTaller, PerformedOn: date(d), Summary: "Cambio de aceite", Items: []byte(`[{"description":"Filtro nuevo","category":"aceite","brand":"Marca Pública","internal_cost":"secreto-coste","mechanic_notes":"secreto-mecanico"}]`), InternalNotes: &private, CreatedBy: &user, Currency: "USD"})
	if err != nil {
		t.Fatal(err)
	}
	_, err = api.q.CreateCorrection(ctx, sqlc.CreateCorrectionParams{HistoryRecordID: rec.ID, CreatedBy: user, Reason: "Detalle ampliado", Changes: []byte(`{"summary":"Revisión de frenos","internal_notes":"secreto-corregido","items":[{"description":"Pastillas cerámicas","category":"frenos","mechanic_notes":"secreto-pieza"}]}`)})
	if err != nil {
		t.Fatal(err)
	}
	for _, keyword := range []string{"aceite", "PUBLICA", "ceramicas", "ampliado"} {
		result := api.obj(owner, "GET", endpoint+"?q="+url.QueryEscape(keyword), "", 200)
		if result["total"] != float64(1) {
			t.Fatalf("%s: %+v", keyword, result)
		}
		raw, _ := json.Marshal(result)
		if strings.Contains(string(raw), "secreto") {
			t.Fatal(string(raw))
		}
	}
	for _, keyword := range []string{"secreto-interno", "secreto-coste", "secreto-mecanico", "secreto-corregido", "secreto-pieza"} {
		result := api.obj(owner, "GET", endpoint+"?q="+keyword, "", 200)
		if result["total"] != float64(0) {
			t.Fatalf("private search match: %s", keyword)
		}
	}
	result := api.obj(owner, "GET", endpoint+"?category=frenos&workshop=Taller&from=2026-01-10&to=2026-01-10", "", 200)
	if result["total"] != float64(1) {
		t.Fatal(result)
	}
}
