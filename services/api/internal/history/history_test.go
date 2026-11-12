package history

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func ptr[T any](v T) *T { return &v }
func fixture() Record {
	id := uuid.New()
	return Record{ID: uuid.New(), WorkshopID: &id, WorkshopName: ptr("taller secreto"), WorkshopVerifiedAt: ptr(time.Date(2020, 1, 2, 0, 0, 0, 0, time.UTC)), Source: "taller", PerformedOn: time.Now(), Summary: "servicio", Currency: "USD", Total: ptr("precio secreto"), WorkshopNotes: ptr("nota taller secreta"), InternalCost: ptr("costo secreto"), InternalNotes: ptr("nota interna secreta"), CreatedBy: ptr(uuid.MustParse("11111111-1111-1111-1111-111111111111")), Items: []Item{{Kind: "pieza", Description: "filtro", Brand: ptr("marca secreta"), Price: ptr("precio secreto"), InternalCost: ptr("costo secreto"), MechanicNotes: ptr("mecanico secreto")}}, Corrections: []Correction{{ID: uuid.New(), Reason: "razon secreta", CreatedBy: uuid.New(), Changes: map[string]json.RawMessage{"summary": json.RawMessage(`"cambio"`), "internal_notes": json.RawMessage(`"nota interna secreta"`), "items": json.RawMessage(`[{"kind":"pieza","description":"filtro","price":"precio secreto","internal_cost":"costo secreto","mechanic_notes":"mecanico secreto"}]`)}}}}
}
func TestProjection(t *testing.T) {
	r := fixture()
	for _, tc := range []struct {
		kind             ViewerKind
		contains, absent []string
	}{{ViewerAuthorWorkshop, []string{"costo secreto", "mecanico secreto", "precio secreto", "razon secreta", "workshop_verified_at"}, nil}, {ViewerOwner, []string{"precio secreto", "razon secreta", "workshop_verified_at"}, []string{"costo secreto", "nota interna secreta", "mecanico secreto", "created_by\":\"11111111"}}, {ViewerLinkedWorkshop, []string{"filtro", "cambio"}, []string{"precio secreto", "costo secreto", "nota interna secreta", "nota taller secreta", "mecanico secreto", "taller secreto", "marca secreta", "razon secreta", "internal_cost", "internal_notes", "mechanic_notes", "workshop_id", "workshop_name", "workshop_verified_at", "created_by", "price", "total", "currency", "reason"}}, {ViewerReport, []string{"filtro", "cambio", "taller secreto", "workshop_verified_at", "marca secreta"}, []string{"precio secreto", "costo secreto", "nota interna secreta", "nota taller secreta", "mecanico secreto", "razon secreta", "internal_cost", "internal_notes", "mechanic_notes", "workshop_id", "created_by", "price", "total", "currency", "reason"}}} {
		t.Run(fmt.Sprint(tc.kind), func(t *testing.T) {
			p, ok := Project(tc.kind, r)
			if !ok {
				t.Fatal("sin proyección")
			}
			b, err := json.Marshal(p)
			if err != nil {
				t.Fatal(err)
			}
			for _, s := range tc.contains {
				if !strings.Contains(string(b), s) {
					t.Errorf("falta %q: %s", s, b)
				}
			}
			for _, s := range tc.absent {
				if strings.Contains(string(b), s) {
					t.Errorf("filtrado falló %q: %s", s, b)
				}
			}
		})
	}
	if _, ok := Project(ViewerNone, r); ok {
		t.Fatal("None visible")
	}
	// En el reporte, ni los registros propios del propietario muestran montos.
	manual := fixture()
	manual.Source = "propietario"
	p, _ := Project(ViewerReport, manual)
	if b, _ := json.Marshal(p); strings.Contains(string(b), "precio secreto") || strings.Contains(string(b), "costo secreto") || strings.Contains(string(b), "nota taller secreta") {
		t.Fatalf("reporte con datos privados: %s", b)
	}
}
func TestResolveViewer(t *testing.T) {
	r := fixture()
	other := uuid.New()
	for _, tc := range []struct {
		v    Viewer
		want ViewerKind
	}{{Viewer{}, ViewerNone}, {Viewer{WorkshopID: &other}, ViewerNone}, {Viewer{WorkshopID: &other, WorkshopLinked: true}, ViewerLinkedWorkshop}, {Viewer{IsOwner: true, WorkshopID: &other, WorkshopLinked: true}, ViewerOwner}, {Viewer{WorkshopID: r.WorkshopID, IsOwner: true}, ViewerAuthorWorkshop}, {Viewer{WorkshopID: r.WorkshopID}, ViewerAuthorWorkshop}, {Viewer{WorkshopLinked: true}, ViewerNone}} {
		if got := ResolveViewer(r, tc.v); got != tc.want {
			t.Errorf("%+v: %v != %v", tc.v, got, tc.want)
		}
	}
	r.Source = "propietario"
	if got := ResolveViewer(r, Viewer{WorkshopID: r.WorkshopID, IsOwner: true}); got != ViewerOwner {
		t.Fatal(got)
	}
}
func TestPropertyPrivateFields(t *testing.T) {
	random := rand.New(rand.NewSource(10))
	for i := 0; i < 500; i++ {
		secret := fmt.Sprintf("private-%d", random.Int63())
		r := fixture()
		r.InternalCost = &secret
		r.InternalNotes = &secret
		r.Items[0].InternalCost = &secret
		r.Items[0].MechanicNotes = &secret
		for _, k := range []ViewerKind{ViewerOwner, ViewerLinkedWorkshop} {
			p, _ := Project(k, r)
			b, _ := json.Marshal(p)
			if strings.Contains(string(b), secret) {
				t.Fatalf("secreto visible: %s", b)
			}
		}
	}
}
func TestOwnerManualAndOrder(t *testing.T) {
	r := fixture()
	r.Source = "propietario"
	p, _ := Project(ViewerOwner, r)
	if p.InternalCost == nil || p.Items[0].MechanicNotes == nil {
		t.Fatal("registro manual incompleto")
	}
}
