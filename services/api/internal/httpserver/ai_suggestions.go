package httpserver

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"kilora/api/internal/assistant"
	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/history"
	"kilora/api/internal/maintenance"
	"kilora/api/internal/values"
)

type suggestionDTO struct {
	Category    string  `json:"category"`
	Description string  `json:"description"`
	DueDate     *string `json:"due_date"`
	DueKm       *int32  `json:"due_km"`
	Overdue     bool    `json:"overdue"`
	LastOn      string  `json:"last_performed_on"`
	LastKm      *int32  `json:"last_odometer_km"`
	KmSince     *int32  `json:"km_since"`
	MonthsSince int     `json:"months_since"`
	// AIWorded indica si el texto lo redactó la IA (si no, es la plantilla).
	AIWorded bool `json:"ai_worded"`
}

func fallbackSuggestion(d maintenance.Due) string {
	text := fmt.Sprintf("Revisar %s: último servicio hace %d meses", strings.ToLower(maintenance.Labels[d.Category]), d.MonthsSince)
	if d.KmSince != nil {
		text += fmt.Sprintf(", %s km recorridos", thousands(*d.KmSince))
	}
	return text
}

func thousands(n int32) string {
	s := fmt.Sprint(n)
	for i := len(s) - 3; i > 0; i -= 3 {
		s = s[:i] + "," + s[i:]
	}
	return s
}

// suggestRecommendations propone recomendaciones para un vehículo. Las
// reglas de mantenimiento deciden qué toca con el historial que este taller
// puede ver; la IA, si está activa, solo redacta el texto. No guarda nada: el
// recepcionista agrega las que quiera.
func (s *server) suggestRecommendations(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	if err := wc.requireWriter(); err != nil {
		return err
	}
	id, err := pathID(r, "vehicleID", vehicleNotFound)
	if err != nil {
		return err
	}
	ctx := r.Context()
	q := sqlc.New(s.db)
	vehicle, err := q.GetVehicle(ctx, sqlc.GetVehicleParams{ID: id, WorkshopID: wc.workshopID})
	if err != nil {
		return notFoundIfMissing(err, vehicleNotFound)
	}
	rows, err := q.ListHistoryByVehicle(ctx, sqlc.ListHistoryByVehicleParams{VehicleID: id, WorkshopID: wc.workshopID})
	if err != nil {
		return err
	}
	corrections, err := q.ListCorrectionsByVehicle(ctx, sqlc.ListCorrectionsByVehicleParams{VehicleID: id, WorkshopID: wc.workshopID})
	if err != nil {
		return err
	}
	isOwner := vehicle.OwnerUserID != nil && *vehicle.OwnerUserID == wc.userID
	records, err := projectHistory(ctx, q, history.Viewer{WorkshopID: &wc.workshopID, WorkshopLinked: true, IsOwner: isOwner}, rows, corrections)
	if err != nil {
		return err
	}
	var currentKm *int32
	if reading, err := q.GetLatestOdometerReading(ctx, sqlc.GetLatestOdometerReadingParams{VehicleID: id, WorkshopID: wc.workshopID}); err == nil {
		currentKm = &reading.Km
	}
	pending, err := q.ListRecommendationsByVehicle(ctx, sqlc.ListRecommendationsByVehicleParams{VehicleID: id, WorkshopID: wc.workshopID})
	if err != nil {
		return err
	}
	covered := map[string]bool{}
	for _, p := range pending {
		if p.Status == sqlc.RecommendationStatusPendiente && p.Category != nil {
			covered[string(*p.Category)] = true
		}
	}

	var due []maintenance.Due
	for _, d := range maintenance.DueSoon(records, currentKm, values.Today()) {
		if !covered[d.Category] {
			due = append(due, d)
		}
	}
	out := make([]suggestionDTO, 0, len(due))
	facts := make([]assistant.SuggestionFact, 0, len(due))
	for _, d := range due {
		dto := suggestionDTO{Category: d.Category, Description: fallbackSuggestion(d), DueKm: d.DueKm, Overdue: d.Overdue(), LastOn: d.LastOn.Format(time.DateOnly), LastKm: d.LastKm, KmSince: d.KmSince, MonthsSince: d.MonthsSince}
		if !d.DueDate.IsZero() {
			due := d.DueDate.Format(time.DateOnly)
			dto.DueDate = &due
		}
		out = append(out, dto)
		facts = append(facts, assistant.SuggestionFact{Category: d.Category, Label: maintenance.Labels[d.Category], LastService: d.LastSummary, LastOn: dto.LastOn, LastKm: d.LastKm, KmSince: d.KmSince, MonthsSince: d.MonthsSince, Overdue: dto.Overdue})
	}
	// Sin IA, o si falla, las sugerencias siguen sirviendo con la plantilla.
	if len(out) > 0 && s.ai != nil && s.aiAllowed(r) == nil {
		words, err := s.ai.WordSuggestions(ctx, vehicleLabel(vehicle.Make, vehicle.Model, vehicle.Year), facts)
		if err != nil {
			s.logger.Warn("redacción de sugerencias", "error", err)
		}
		for i := range out {
			if text, ok := words[out[i].Category]; ok {
				out[i].Description, out[i].AIWorded = text, true
			}
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"suggestions": out, "current_odometer_km": currentKm})
	return nil
}
