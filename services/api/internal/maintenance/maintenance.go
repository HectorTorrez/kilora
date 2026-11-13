// Package maintenance decide, con reglas fijas, qué zonas de un vehículo
// tocan mantenimiento según su historial y su kilometraje. La IA solo redacta
// el texto de la recomendación; nunca decide qué toca.
package maintenance

import (
	"encoding/json"
	"math"
	"regexp"
	"sort"
	"strings"
	"time"

	"kilora/api/internal/history"
)

// Interval es el intervalo de referencia de una categoría. Son los mismos que
// usa el mapa del vehículo en la web (apps/web/src/lib/parts-map.ts).
type Interval struct {
	Km     int32 `json:"km"`
	Months int   `json:"months"`
}

var Intervals = map[string]Interval{
	"aceite":             {Km: 5000, Months: 6},
	"motor":              {Km: 40000, Months: 36},
	"refrigeracion":      {Km: 40000, Months: 24},
	"aire_acondicionado": {Months: 24},
	"bateria":            {Months: 36},
	"transmision":        {Km: 60000, Months: 48},
	"frenos":             {Km: 30000, Months: 24},
	"amortiguadores":     {Km: 80000, Months: 60},
	"llantas":            {Km: 50000, Months: 48},
}

var Labels = map[string]string{
	"aceite":             "Aceite",
	"motor":              "Motor",
	"refrigeracion":      "Refrigeración",
	"aire_acondicionado": "Aire acondicionado",
	"bateria":            "Batería",
	"transmision":        "Transmisión",
	"frenos":             "Frenos",
	"amortiguadores":     "Amortiguadores",
	"llantas":            "Llantas",
}

// SoonAt es la fracción del intervalo a partir de la cual se sugiere el
// trabajo (igual que "pronto" en la web).
const SoonAt = 0.8

// Los servicios que registra el propietario no traen categoría: se infiere
// del texto, con las mismas palabras clave que la web.
var keywords = []struct {
	category string
	re       *regexp.Regexp
}{
	{"aceite", regexp.MustCompile(`aceite|lubric`)},
	{"refrigeracion", regexp.MustCompile(`radiador|refrigerante|anticongelante|termostato|bomba de agua|enfriamiento`)},
	{"aire_acondicionado", regexp.MustCompile(`aire acondicionado|\ba/?c\b|compresor|condensador|recarga de gas`)},
	{"bateria", regexp.MustCompile(`bater[ií]a|acumulador`)},
	{"transmision", regexp.MustCompile(`transmisi|caja de|embrague|clutch|cloch|diferencial|card[aá]n|homocin|flecha|transfer|4x4|tracci[oó]n`)},
	{"frenos", regexp.MustCompile(`fren|pastilla|balata|zapata|disco|caliper|mordaza|tambor`)},
	{"amortiguadores", regexp.MustCompile(`amortigu|suspensi|resorte|espiral|muelle|strut|buje|ballesta`)},
	{"llantas", regexp.MustCompile(`llanta|neum[aá]tic|rotaci[oó]n|alineaci|balanceo|\brin(es)?\b`)},
}

var motorKeywords = regexp.MustCompile(`motor|buj[ií]a|filtro de aire|correa|banda|distribuci|inyector|afinaci|culata|empaque`)

func categoriesOfText(text string) []string {
	t := strings.ToLower(text)
	var found []string
	for _, k := range keywords {
		if k.re.MatchString(t) {
			found = append(found, k.category)
		}
	}
	if len(found) == 0 && motorKeywords.MatchString(t) {
		found = append(found, "motor")
	}
	return found
}

// categories devuelve las categorías con intervalo que tocó un servicio.
func categories(r history.Projected) map[string]bool {
	out := map[string]bool{}
	add := func(cs ...string) {
		for _, c := range cs {
			if _, ok := Intervals[c]; ok {
				out[c] = true
			}
		}
	}
	for _, item := range r.Items {
		if item.Category != nil && *item.Category != "" && *item.Category != "otro" {
			add(*item.Category)
			continue
		}
		name := ""
		if item.Name != nil {
			name = *item.Name
		}
		add(categoriesOfText(item.Description + " " + name)...)
	}
	if len(r.Items) == 0 {
		add(categoriesOfText(r.Summary)...)
	}
	return out
}

// Due es una categoría a la que le toca mantenimiento.
type Due struct {
	Category    string
	LastOn      time.Time
	LastKm      *int32
	LastSummary string
	KmSince     *int32
	MonthsSince int
	// Wear es la fracción consumida del intervalo (1 = vencido).
	Wear    float64
	DueKm   *int32
	DueDate time.Time
}

func (d Due) Overdue() bool { return d.Wear >= 1 }

func monthsBetween(from, to time.Time) int {
	m := (to.Year()-from.Year())*12 + int(to.Month()) - int(from.Month())
	if m < 0 {
		return 0
	}
	return m
}

// DueSoon revisa el historial visible y devuelve las categorías cuyo último
// servicio consumió al menos SoonAt de su intervalo, la más urgente primero.
func DueSoon(records []history.Projected, currentKm *int32, today time.Time) []Due {
	out := []Due{}
	for _, d := range Forecast(records, currentKm, today, nil) {
		if d.Wear >= SoonAt {
			out = append(out, d)
		}
	}
	return out
}

// Forecast returns every category with a recorded service, including work that
// is not due yet. Unknown history never becomes an invented maintenance date.
func Forecast(records []history.Projected, currentKm *int32, today time.Time, overrides map[string]Interval) []Due {
	type last struct {
		on  time.Time
		rec history.Projected
	}
	latest := map[string]last{}
	for _, r := range records {
		r = effectiveRecord(r)
		on, err := time.Parse(time.DateOnly, r.PerformedOn)
		if err != nil {
			continue
		}
		for c := range categories(r) {
			if prev, ok := latest[c]; !ok || on.After(prev.on) {
				latest[c] = last{on, r}
			}
		}
	}
	var out []Due
	for c, l := range latest {
		iv := Intervals[c]
		if custom, ok := overrides[c]; ok {
			iv = custom
		}
		d := Due{Category: c, LastOn: l.on, LastKm: l.rec.OdometerKm, LastSummary: l.rec.Summary, MonthsSince: monthsBetween(l.on, today)}
		if iv.Months > 0 {
			d.DueDate = l.on.AddDate(0, iv.Months, 0)
			d.Wear = max(0, float64(today.Sub(l.on))/float64(d.DueDate.Sub(l.on)))
		}
		if iv.Km > 0 && l.rec.OdometerKm != nil {
			if sum := int64(*l.rec.OdometerKm) + int64(iv.Km); sum <= math.MaxInt32 {
				due := int32(sum)
				d.DueKm = &due
			}
			if currentKm != nil && *currentKm >= *l.rec.OdometerKm {
				since := max(0, *currentKm-*l.rec.OdometerKm)
				d.KmSince = &since
				d.Wear = max(d.Wear, float64(since)/float64(iv.Km))
			}
		}
		out = append(out, d)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Wear != out[j].Wear {
			return out[i].Wear > out[j].Wear
		}
		return out[i].Category < out[j].Category
	})
	return out
}

func ValidInterval(category string, iv Interval) bool {
	_, ok := Intervals[category]
	return ok && iv.Km >= 0 && iv.Km <= 1000000 && iv.Months >= 0 && iv.Months <= 120 && (iv.Km > 0 || iv.Months > 0)
}

func effectiveRecord(r history.Projected) history.Projected {
	corrections := append([]history.ProjectedCorrection(nil), r.Corrections...)
	sort.SliceStable(corrections, func(i, j int) bool { return corrections[i].CreatedAt.Before(corrections[j].CreatedAt) })
	for _, c := range corrections {
		for key, raw := range c.Changes {
			switch key {
			case "performed_on":
				var value *string
				if json.Unmarshal(raw, &value) == nil && value != nil {
					r.PerformedOn = *value
				}
			case "summary":
				var value *string
				if json.Unmarshal(raw, &value) == nil && value != nil {
					r.Summary = *value
				}
			case "odometer_km":
				var value *int32
				if json.Unmarshal(raw, &value) == nil {
					r.OdometerKm = value
				}
			case "items":
				var value []history.Item
				if json.Unmarshal(raw, &value) == nil {
					r.Items = value
				}
			}
		}
	}
	return r
}
