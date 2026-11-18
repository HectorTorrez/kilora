package assistant

import "testing"

func TestWorkshopActionScope(t *testing.T) {
	s := Session{Page: "/taller/cotizaciones", ActiveWorkshopID: "A", Memberships: []Membership{
		{WorkshopID: "A", BranchID: "1", Role: "admin"}, {WorkshopID: "A", BranchID: "2", Role: "recepcion"}, {WorkshopID: "B", BranchID: "3", Role: "mecanico"},
	}}
	for _, tc := range []struct{ workshop, branch, want string }{{"A", "", "prepare_counter_quote"}, {"A", "1", "prepare_counter_quote"}, {"A", "2", ""}, {"B", "3", ""}, {"X", "", ""}} {
		s.ActiveWorkshopID, s.ActiveBranchID = tc.workshop, tc.branch
		got := ""
		if tool := actionTool(s); tool != nil {
			got = tool.Function.Name
		}
		if got != tc.want {
			t.Fatalf("taller %s sucursal %s: %s", tc.workshop, tc.branch, got)
		}
	}
	s.Page = "/mis-vehiculos"
	if tool := actionTool(s); tool == nil || tool.Function.Name != prepareService {
		t.Fatal("Falta el servicio en modo propietario")
	}
}

func TestActionReviewText(t *testing.T) {
	if got := joinNonEmpty("", "Corolla", " "); got != "Corolla" {
		t.Fatalf("vehículo sin marca ni placa: %q", got)
	}
	got := branchList(map[string]string{"2": "Santa Ana", "1": "Centro"})
	if got != "Centro (1); Santa Ana (2)" {
		t.Fatalf("sucursales sin orden estable: %q", got)
	}
}
