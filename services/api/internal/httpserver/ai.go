package httpserver

import (
	"encoding/base64"
	"net/http"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"kilora/api/internal/assistant"
	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/values"
)

const (
	aiTimeout   = time.Minute
	aiRateLimit = 40 // borradores de IA por usuario cada limiterWindow
)

var errAIDisabled = httpError{http.StatusServiceUnavailable, "La IA no está configurada"}

// aiPaths son las rutas que llaman al modelo y necesitan más tiempo que el
// límite general. Se reconocen por el final de la ruta.
var aiPaths = []string{"/ai/quote-draft", receiptPath, "/ai/explain", "/ai/message"}

const (
	receiptPath = "/ai/receipt"
	// maxReceiptBody admite la foto en base64; la web la reduce antes de enviarla.
	maxReceiptBody  = 6 << 20
	maxReceiptImage = 4 << 20
)

// bodyLimit es el tamaño máximo del cuerpo de una petición: 1 MB, salvo la
// foto de un recibo.
func bodyLimit(r *http.Request) int64 {
	if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, receiptPath) {
		return maxReceiptBody
	}
	return 1 << 20
}

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

// receiptImageURL valida que image sea una data URL de una foto (JPEG, PNG o
// WebP) de tamaño razonable.
func receiptImageURL(image string) (string, bool) {
	for _, prefix := range []string{"data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,"} {
		if data, ok := strings.CutPrefix(image, prefix); ok {
			raw, err := base64.StdEncoding.DecodeString(data)
			return image, err == nil && len(raw) > 0 && len(raw) <= maxReceiptImage
		}
	}
	return "", false
}

// readReceipt lee la foto de un recibo para prellenar un servicio manual del
// propietario. La imagen no se guarda y nada se escribe: el propietario
// revisa los datos y guarda el servicio él mismo.
func (s *server) readReceipt(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Image string `json:"image"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	ctx := r.Context()
	if _, err := ownedVehicle(ctx, sqlc.New(s.db), r, currentUser(ctx).ID); err != nil {
		return err
	}
	image, ok := receiptImageURL(in.Image)
	if !ok {
		return badRequest("La foto no es válida. Usá una imagen JPG, PNG o WebP de hasta 4 MB.")
	}
	if err := s.aiAllowed(r); err != nil {
		return err
	}
	draft, err := s.ai.ReadReceipt(ctx, image, values.Today())
	if err != nil {
		s.logger.Error("lectura de recibo", "error", err)
		return httpError{http.StatusBadGateway, "La IA no pudo leer el recibo. Intenta de nuevo."}
	}
	writeJSON(w, http.StatusOK, draft)
	return nil
}
