package httpserver

import (
	"encoding/json"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/history"
)

type historySearch struct{ text, workshop, category, from, to string }

func parseHistorySearch(r *http.Request) (historySearch, error) {
	values := r.URL.Query()
	f := historySearch{text: strings.TrimSpace(values.Get("q")), workshop: strings.TrimSpace(values.Get("workshop")), category: strings.TrimSpace(values.Get("category"))}
	if utf8.RuneCountInString(f.text) > 200 || utf8.RuneCountInString(f.workshop) > 200 {
		return f, badRequest("La búsqueda y el taller admiten hasta 200 caracteres")
	}
	if f.category != "" && !sqlc.PartCategory(f.category).Valid() {
		return f, badRequest("Categoría inválida")
	}
	from, to, err := dateRange(r)
	if err != nil {
		return f, err
	}
	if from.Valid {
		f.from = from.Time.Format("2006-01-02")
	}
	if to.Valid {
		f.to = to.Time.Format("2006-01-02")
	}
	f.text, f.workshop = normalizeHistoryText(f.text), normalizeHistoryText(f.workshop)
	return f, nil
}

var historyAccents = strings.NewReplacer("á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "ü", "u", "ñ", "n")

func normalizeHistoryText(value string) string {
	value = historyAccents.Replace(strings.ToLower(value))
	value = strings.Map(func(r rune) rune {
		if unicode.Is(unicode.Mn, r) {
			return -1
		}
		return r
	}, value)
	return strings.Join(strings.Fields(value), " ")
}

func historyWorkshop(r history.Projected) string {
	if r.WorkshopName != nil {
		return strings.TrimSpace(*r.WorkshopName)
	}
	if r.Source == "propietario" && r.WorkshopNotes != nil {
		if name, ok := strings.CutPrefix(*r.WorkshopNotes, "Realizado en: "); ok {
			return strings.TrimSpace(name)
		}
	}
	return ""
}

var historyCategoryLabels = map[string]string{
	"aceite": "Aceite", "motor": "Motor", "refrigeracion": "Refrigeración", "aire_acondicionado": "Aire acondicionado", "bateria": "Batería", "transmision": "Transmisión", "frenos": "Frenos", "amortiguadores": "Amortiguadores", "llantas": "Llantas", "electrico": "Sistema eléctrico", "direccion": "Dirección", "escape": "Escape", "carroceria": "Carrocería", "otro": "Otro",
}
var historyCategoryPatterns = map[string]*regexp.Regexp{
	"aceite":             regexp.MustCompile(`aceite|lubric`),
	"motor":              regexp.MustCompile(`motor|bujia|filtro de aire|correa|banda|distribuci|inyector|afinaci|culata|empaque`),
	"refrigeracion":      regexp.MustCompile(`radiador|refrigerante|anticongelante|termostato|bomba de agua|enfriamiento|refrigeraci`),
	"aire_acondicionado": regexp.MustCompile(`aire acondicionado|\ba/?c\b|compresor|condensador|recarga de gas`),
	"bateria":            regexp.MustCompile(`bateria|acumulador`),
	"transmision":        regexp.MustCompile(`transmisi|caja de|embrague|clutch|cloch|diferencial|cardan|homocin|flecha|transfer|4x4|traccion`),
	"frenos":             regexp.MustCompile(`fren|pastilla|balata|zapata|disco|caliper|mordaza|tambor`),
	"amortiguadores":     regexp.MustCompile(`amortigu|suspensi|resorte|espiral|muelle|strut|buje|ballesta`),
	"llantas":            regexp.MustCompile(`llanta|neumatic|rotaci|alineaci|balanceo|\brin(es)?\b`),
	"electrico":          regexp.MustCompile(`electri|alternador|arranque|fusible|cableado|faro|luz|luces`),
	"direccion":          regexp.MustCompile(`direcci|cremallera|terminal de direc|rotula|volante`),
	"escape":             regexp.MustCompile(`escape|catalizador|silenciador|mofle|sensor de oxigeno`),
	"carroceria":         regexp.MustCompile(`carrocer|pintura|parabrisas|vidrio|espejo|parachoque|bumper|puerta|capo`),
}

func historyHasCategory(summary string, items []history.Item, category string) bool {
	if category == "" {
		return true
	}
	inferred := func(text string) bool {
		normalized := normalizeHistoryText(text)
		if category == "otro" {
			for _, pattern := range historyCategoryPatterns {
				if pattern.MatchString(normalized) {
					return false
				}
			}
			return true
		}
		return historyCategoryPatterns[category].MatchString(normalized)
	}
	if len(items) == 0 {
		return inferred(summary)
	}
	for _, item := range items {
		if item.Category != nil && *item.Category != "" {
			if *item.Category == category {
				return true
			}
			continue
		}
		text := item.Description
		if item.Name != nil {
			text += " " + *item.Name
		}
		if inferred(text) {
			return true
		}
	}
	return false
}

func historyItemText(items []history.Item) string {
	var text strings.Builder
	for _, item := range items {
		text.WriteString(" " + item.Description)
		for _, value := range []*string{item.Name, item.Brand, item.Model} {
			if value != nil {
				text.WriteString(" " + *value)
			}
		}
		if item.Category != nil {
			text.WriteString(" " + historyCategoryLabels[*item.Category])
		}
	}
	return text.String()
}

func (f historySearch) matches(r history.Projected) bool {
	if f.from != "" && r.PerformedOn < f.from || f.to != "" && r.PerformedOn > f.to {
		return false
	}
	if f.workshop != "" && normalizeHistoryText(historyWorkshop(r)) != f.workshop {
		return false
	}
	hasCategory := historyHasCategory(r.Summary, r.Items, f.category)
	text := r.Summary + " " + historyWorkshop(r) + historyItemText(r.Items)
	if r.WorkshopNotes != nil {
		text += " " + *r.WorkshopNotes
	}
	// Only inspect fields of the owner projection. Never search raw JSON or a
	// private workshop field, even when a match would return no private content.
	for _, c := range r.Corrections {
		if c.Reason != nil {
			text += " " + *c.Reason
		}
		for _, key := range []string{"summary", "workshop_notes", "workshop_name"} {
			var value string
			if raw, ok := c.Changes[key]; ok && json.Unmarshal(raw, &value) == nil {
				text += " " + value
				if key == "summary" {
					hasCategory = hasCategory || historyHasCategory(value, nil, f.category)
				}
			}
		}
		if raw, ok := c.Changes["items"]; ok {
			var items []history.Item
			if json.Unmarshal(raw, &items) == nil {
				text += historyItemText(items)
				hasCategory = hasCategory || historyHasCategory("", items, f.category)
			}
		}
	}
	if !hasCategory {
		return false
	}
	text = normalizeHistoryText(text)
	for _, word := range strings.Fields(f.text) {
		if !strings.Contains(text, word) {
			return false
		}
	}
	return true
}

func filterOwnerHistory(records []history.Projected, f historySearch, limit, offset int32) ([]history.Projected, int, []string) {
	matches := []history.Projected{}
	names := map[string]string{}
	for _, record := range records {
		if name := historyWorkshop(record); name != "" {
			names[normalizeHistoryText(name)] = name
		}
		if f.matches(record) {
			matches = append(matches, record)
		}
	}
	workshops := make([]string, 0, len(names))
	for _, name := range names {
		workshops = append(workshops, name)
	}
	sort.Slice(workshops, func(i, j int) bool { return normalizeHistoryText(workshops[i]) < normalizeHistoryText(workshops[j]) })
	total := len(matches)
	start := min(int(offset), total)
	end := min(start+int(limit), total)
	return matches[start:end], total, workshops
}
