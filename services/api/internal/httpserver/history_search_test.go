package httpserver

import (
	"encoding/json"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"kilora/api/internal/history"
)

func TestHistorySearchUsesOnlyVisibleFields(t *testing.T) {
	ptr := func(value string) *string { return &value }
	performed, _ := time.Parse(time.DateOnly, "2026-01-10")
	rec, _ := history.Project(history.ViewerOwner, history.Record{
		Source: "taller", PerformedOn: performed, Summary: "Cambio de batería", WorkshopName: ptr("Taller El Árbol"), WorkshopNotes: ptr("Garantía del servicio"), InternalNotes: ptr("secreto-interno"),
		Items: []history.Item{{Description: "Batería nueva", Category: ptr("bateria"), Name: ptr("Acumulador"), Brand: ptr("Bosch"), Model: ptr("S4"), InternalCost: ptr("secreto-coste"), MechanicNotes: ptr("secreto-mecanico")}},
		Corrections: []history.Correction{{Changes: map[string]json.RawMessage{
			"summary":        json.RawMessage(`"Revisión de frenos"`),
			"internal_notes": json.RawMessage(`"secreto-corregido"`),
			"items":          json.RawMessage(`[{"description":"Pastillas cerámicas","category":"frenos","mechanic_notes":"secreto-pieza"}]`),
		}}},
	})
	for _, tt := range []struct {
		query string
		want  bool
	}{
		{"q=BATERIA+bosch", true}, {"q=" + url.QueryEscape("BATERI\u0301A"), true}, {"q=arbol+garantia", true}, {"q=ceramicas", true},
		{"category=bateria", true}, {"category=frenos", true}, {"category=llantas", false},
		{"from=2026-01-10&to=2026-01-10", true}, {"from=2026-01-11", false}, {"to=2026-01-09", false},
		{"workshop=TALLER+EL+ARBOL", true}, {"workshop=Otro", false},
		{"q=secreto-interno", false}, {"q=secreto-coste", false}, {"q=secreto-mecanico", false}, {"q=secreto-corregido", false}, {"q=secreto-pieza", false},
		{"q=%25", false}, {"q=_", false},
	} {
		f, err := parseHistorySearch(httptest.NewRequest("GET", "/?"+tt.query, nil))
		if err != nil {
			t.Fatal(err)
		}
		if got := f.matches(rec); got != tt.want {
			t.Errorf("%s: got %v, want %v", tt.query, got, tt.want)
		}
	}
}

func TestHistorySearchManualCategories(t *testing.T) {
	for _, tt := range []struct{ summary, category string }{
		{"Cambio de aceite", "aceite"}, {"Cambio de batería", "bateria"}, {"Recarga aire acondicionado", "aire_acondicionado"},
		{"Revisión alternador", "electrico"}, {"Cambio de cremallera de dirección", "direccion"}, {"Revisión silenciador", "escape"}, {"Pintura de puerta", "carroceria"},
		{"Cambio de bujías", "motor"}, {"Pastillas delanteras", "frenos"}, {"Rotación de llantas", "llantas"},
		{"Cambio de amortiguadores", "amortiguadores"}, {"Cambio de refrigerante", "refrigeracion"}, {"Cambio de embrague", "transmision"}, {"Lavado general", "otro"},
	} {
		if !historyHasCategory(tt.summary, nil, tt.category) {
			t.Errorf("%s not classified as %s", tt.summary, tt.category)
		}
	}
	explicit := "electrico"
	if historyHasCategory("Cambio de batería", []history.Item{{Description: "Batería", Category: &explicit}}, "bateria") {
		t.Fatal("explicit category must take precedence over inferred category")
	}
}

func TestHistorySearchValidation(t *testing.T) {
	for _, query := range []string{"category=unknown", "from=2026-02-30", "to=no", "from=2026-02-02&to=2026-01-01", "q=" + strings.Repeat("a", 201), "workshop=" + strings.Repeat("a", 201)} {
		if _, err := parseHistorySearch(httptest.NewRequest("GET", "/?"+query, nil)); err == nil {
			t.Errorf("accepted invalid query %s", query)
		}
	}
}
