package maintenance

import (
	"testing"
	"time"

	"kilora/api/internal/history"
)

func km(v int32) *int32 { return &v }
func str(s string) *string { return &s }

func TestDueSoon(t *testing.T) {
	today := time.Date(2026, 11, 12, 0, 0, 0, 0, time.UTC)
	records := []history.Projected{
		// Aceite: 7 meses → vencido por tiempo, y 6,000 km recorridos.
		{PerformedOn: "2026-04-01", OdometerKm: km(40000), Items: []history.Item{{Description: "Aceite 5W-30", Category: str("aceite")}}},
		// Aceite más viejo: no cuenta, gana el más reciente.
		{PerformedOn: "2025-01-01", OdometerKm: km(30000), Items: []history.Item{{Description: "Aceite", Category: str("aceite")}}},
		// Frenos por texto (registro del propietario): 25,000 de 30,000 km → pronto.
		{PerformedOn: "2026-06-01", OdometerKm: km(21000), Summary: "Pastillas delanteras", Items: []history.Item{{Description: "Cambio de pastillas"}}},
		// Batería reciente: al día.
		{PerformedOn: "2026-01-01", Items: []history.Item{{Description: "Batería", Category: str("bateria")}}},
		// Eléctrico: sin intervalo, nunca se sugiere.
		{PerformedOn: "2010-01-01", Items: []history.Item{{Description: "Alternador", Category: str("electrico")}}},
	}
	due := DueSoon(records, km(46000), today)
	if len(due) != 2 {
		t.Fatalf("%d sugerencias: %+v", len(due), due)
	}
	oil, brakes := due[0], due[1]
	if oil.Category != "aceite" || !oil.Overdue() || *oil.KmSince != 6000 || *oil.DueKm != 45000 || oil.DueDate.Format(time.DateOnly) != "2026-10-01" {
		t.Fatalf("aceite: %+v", oil)
	}
	if brakes.Category != "frenos" || brakes.Overdue() || *brakes.DueKm != 51000 {
		t.Fatalf("frenos: %+v", brakes)
	}
}

func TestDueSoonWithoutMileageUsesTime(t *testing.T) {
	today := time.Date(2026, 11, 12, 0, 0, 0, 0, time.UTC)
	due := DueSoon([]history.Projected{{PerformedOn: "2024-01-15", Summary: "Cambio de batería"}}, nil, today)
	if len(due) != 1 || due[0].Category != "bateria" || due[0].DueKm != nil {
		t.Fatalf("%+v", due)
	}
}
