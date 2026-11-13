package maintenance

import (
	"encoding/json"
	"testing"
	"time"

	"kilora/api/internal/history"
)

func km(v int32) *int32    { return &v }
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

func TestForecastIncludesUpcomingAndCustomIntervals(t *testing.T) {
	today := time.Date(2026, 11, 13, 0, 0, 0, 0, time.UTC)
	records := []history.Projected{{PerformedOn: "2026-11-01", OdometerKm: km(40000), Summary: "Cambio de aceite"}}
	plan := Forecast(records, km(41000), today, map[string]Interval{"aceite": {Km: 10000, Months: 12}})
	if len(plan) != 1 || plan[0].Wear >= SoonAt || *plan[0].DueKm != 50000 || plan[0].DueDate.Format(time.DateOnly) != "2027-11-01" {
		t.Fatalf("custom forecast: %+v", plan)
	}
	if got := DueSoon(records, km(41000), today); len(got) != 0 {
		t.Fatalf("recent work is not due: %+v", got)
	}
	if got := Forecast(nil, km(41000), today, nil); len(got) != 0 {
		t.Fatalf("invented history: %+v", got)
	}
}

func TestForecastDueOnExactDay(t *testing.T) {
	records := []history.Projected{{PerformedOn: "2026-05-20", Summary: "Cambio de aceite"}}
	for _, tt := range []struct {
		day     string
		overdue bool
	}{{"2026-11-19", false}, {"2026-11-20", true}} {
		today, _ := time.Parse(time.DateOnly, tt.day)
		got := Forecast(records, nil, today, nil)
		if len(got) != 1 || got[0].Overdue() != tt.overdue {
			t.Fatalf("%s: %+v", tt.day, got)
		}
	}
}

func TestForecastAppliesCorrectionsChronologically(t *testing.T) {
	today := time.Date(2026, 11, 13, 0, 0, 0, 0, time.UTC)
	records := []history.Projected{{PerformedOn: "2025-01-01", OdometerKm: km(10000), Summary: "Cambio de batería", Corrections: []history.ProjectedCorrection{
		{CreatedAt: today, Changes: map[string]json.RawMessage{"performed_on": json.RawMessage(`"2026-11-01"`), "summary": json.RawMessage(`"Cambio de aceite"`), "odometer_km": json.RawMessage(`40000`)}},
		{CreatedAt: today.Add(-time.Hour), Changes: map[string]json.RawMessage{"performed_on": json.RawMessage(`"2026-01-01"`)}},
	}}}
	got := Forecast(records, km(42000), today, nil)
	if len(got) != 1 || got[0].Category != "aceite" || got[0].LastOn.Format(time.DateOnly) != "2026-11-01" || *got[0].DueKm != 45000 {
		t.Fatalf("corrections ignored: %+v", got)
	}
}

func TestForecastMissingAndRegressedMileage(t *testing.T) {
	today := time.Date(2026, 11, 13, 0, 0, 0, 0, time.UTC)
	records := []history.Projected{{PerformedOn: "2026-11-01", Summary: "Cambio de aceite"}}
	got := Forecast(records, km(40000), today, nil)
	if got[0].DueKm != nil || got[0].KmSince != nil {
		t.Fatal("invented mileage")
	}
	records[0].OdometerKm = km(50000)
	got = Forecast(records, km(40000), today, nil)
	if got[0].KmSince != nil {
		t.Fatal("regressed mileage used as evidence")
	}
}

func TestValidInterval(t *testing.T) {
	for _, tt := range []struct {
		category string
		interval Interval
		valid    bool
	}{
		{"aceite", Interval{Km: 10000}, true}, {"aceite", Interval{Months: 12}, true},
		{"aceite", Interval{}, false}, {"aceite", Interval{Km: -1, Months: 12}, false},
		{"aceite", Interval{Km: 1000001}, false}, {"aceite", Interval{Months: 121}, false}, {"inventado", Interval{Km: 1000}, false},
	} {
		if got := ValidInterval(tt.category, tt.interval); got != tt.valid {
			t.Errorf("%+v: %v", tt, got)
		}
	}
}
