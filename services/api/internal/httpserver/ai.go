package httpserver

import (
	"net/http"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"kilora/api/internal/assistant"
)

const (
	aiTimeout   = time.Minute
	aiRateLimit = 40 // borradores de IA por usuario cada limiterWindow
)

var errAIDisabled = httpError{http.StatusServiceUnavailable, "La IA no está configurada"}

// aiPaths son las rutas que llaman al modelo y necesitan más tiempo que el
// límite general. Se reconocen por el final de la ruta.
var aiPaths = []string{"/ai/quote-draft"}

func (s *server) aiAllowed(r *http.Request) error {
	if s.ai == nil {
		return errAIDisabled
	}
	if !s.limiter.allow("ai:"+currentUser(r.Context()).ID.String(), aiRateLimit) {
		return errTooManyRequests
	}
	return nil
}

func partKeys() []string {
	keys := make([]string, 0, len(partCategories))
	for k := range partCategories {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	return keys
}

// quoteDraft convierte una nota escrita o dictada en ítems de cotización. No
// guarda nada: el recepcionista revisa los ítems en el formulario y los
// guarda él mismo.
func (s *server) quoteDraft(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	if err := wc.requireWriter(); err != nil {
		return err
	}
	var in struct {
		Text    string  `json:"text"`
		Vehicle *string `json:"vehicle"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	note := strings.TrimSpace(in.Text)
	if note == "" {
		return badRequest("Describe el trabajo")
	}
	if utf8.RuneCountInString(note) > assistant.MaxDraftText {
		return badRequest("La descripción es demasiado larga")
	}
	vehicle := ""
	if in.Vehicle != nil && utf8.RuneCountInString(*in.Vehicle) <= 120 {
		vehicle = strings.TrimSpace(*in.Vehicle)
	}
	if err := s.aiAllowed(r); err != nil {
		return err
	}
	items, err := s.ai.DraftQuote(r.Context(), note, vehicle, partKeys())
	if err != nil {
		s.logger.Error("borrador de cotización", "error", err)
		return httpError{http.StatusBadGateway, "La IA no pudo generar el borrador. Intenta de nuevo."}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
	return nil
}
