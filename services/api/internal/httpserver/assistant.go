package httpserver

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"kilora/api/internal/assistant"
	"kilora/api/internal/database/sqlc"
)

const (
	assistantChatPath  = "/api/v1/assistant/chat"
	assistantTimeout   = 2 * time.Minute
	assistantRateLimit = 30 // mensajes por usuario cada limiterWindow
)

var elSalvador = func() *time.Location {
	if loc, err := time.LoadLocation("America/El_Salvador"); err == nil {
		return loc
	}
	return time.FixedZone("CST", -6*3600)
}()

// timeouts aplica el tiempo límite general y uno propio a rutas lentas, como
// el asistente, que encadena varias llamadas al modelo.
func timeouts(fallback time.Duration, overrides map[string]time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		general := middleware.Timeout(fallback)(next)
		special := make(map[string]http.Handler, len(overrides))
		for path, d := range overrides {
			special[path] = middleware.Timeout(d)(next)
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if h, ok := special[r.URL.Path]; ok {
				h.ServeHTTP(w, r)
				return
			}
			general.ServeHTTP(w, r)
		})
	}
}

type assistantInput struct {
	Messages []struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	} `json:"messages"`
	WorkshopID *string `json:"workshop_id"`
	Page       *string `json:"page"`
}

func (s *server) assistantChat(w http.ResponseWriter, r *http.Request) error {
	if s.assistant == nil {
		return httpError{http.StatusServiceUnavailable, "El asistente no está configurado"}
	}
	user := currentUser(r.Context())
	var in assistantInput
	if err := decode(r, &in); err != nil {
		return err
	}
	if len(in.Messages) == 0 {
		return badRequest("Escribe una pregunta")
	}
	if len(in.Messages) > assistant.MaxHistory {
		in.Messages = in.Messages[len(in.Messages)-assistant.MaxHistory:]
	}
	history := make([]assistant.Message, 0, len(in.Messages))
	for _, m := range in.Messages {
		content := strings.TrimSpace(m.Content)
		if (m.Role != "user" && m.Role != "assistant") || content == "" {
			return badRequest("Mensaje inválido")
		}
		if utf8.RuneCountInString(content) > assistant.MaxMessageSize {
			return badRequest("El mensaje es demasiado largo")
		}
		history = append(history, assistant.Message{Role: m.Role, Content: &content})
	}
	if history[len(history)-1].Role != "user" {
		return badRequest("El último mensaje debe ser del usuario")
	}
	if !s.limiter.allow("assistant:"+user.ID.String(), assistantRateLimit) {
		return errTooManyRequests
	}

	ctx := r.Context()
	rows, err := sqlc.New(s.db).ListMembershipsByUser(ctx, user.ID)
	if err != nil {
		return err
	}
	session := assistant.Session{UserName: user.FullName, Now: time.Now().In(elSalvador)}
	for _, row := range rows {
		id := row.WorkshopID.String()
		session.Memberships = append(session.Memberships, assistant.Membership{WorkshopID: id, WorkshopName: row.WorkshopName, BranchName: row.BranchName, Role: string(row.Role)})
		if in.WorkshopID != nil && *in.WorkshopID == id {
			session.ActiveWorkshopID = id
		}
	}
	if in.Page != nil && strings.HasPrefix(*in.Page, "/") && len(*in.Page) <= 200 {
		session.Page = *in.Page
	}

	// A partir de aquí la respuesta es un stream de eventos (SSE); los errores
	// viajan como evento "error" porque el estado HTTP ya se envió.
	rc := http.NewResponseController(w)
	_ = rc.SetWriteDeadline(time.Now().Add(assistantTimeout + 5*time.Second))
	h := w.Header()
	h.Set("Content-Type", "text/event-stream; charset=utf-8")
	h.Set("Cache-Control", "no-cache, no-transform")
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	send := func(e any) {
		data, _ := json.Marshal(e)
		_, _ = fmt.Fprintf(w, "data: %s\n\n", data)
		_ = rc.Flush()
	}
	reply, err := s.assistant.Run(ctx, session, history, s.fetchAs(r), func(e assistant.Event) { send(e) })
	if err != nil {
		s.logger.Error("asistente", "user", user.ID, "error", err)
		send(map[string]string{"type": "error", "text": "El asistente no pudo responder. Intenta de nuevo."})
		return nil
	}
	send(map[string]any{"type": "done", "reply": reply.Text})
	return nil
}

// fetchAs ejecuta un GET del API con la misma sesión que la petición
// original. Pasa por el router completo (sesión, membresías, permisos por
// sucursal y proyección del historial), así que el asistente nunca ve más que
// el usuario en la aplicación.
func (s *server) fetchAs(orig *http.Request) assistant.Fetcher {
	return func(ctx context.Context, path string) (int, []byte, error) {
		// Sin el contexto de ruteo ni la sesión de la petición original: el
		// router vuelve a resolver la ruta y a cargar la sesión desde la cookie.
		ctx = context.WithValue(context.WithValue(ctx, chi.RouteCtxKey, nil), userKey, nil)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, path, nil)
		if err != nil {
			return 0, nil, err
		}
		req.RemoteAddr = orig.RemoteAddr
		for _, c := range orig.Cookies() {
			req.AddCookie(c)
		}
		rec := &bufferedResponse{header: http.Header{}, status: http.StatusOK}
		s.router.ServeHTTP(rec, req)
		return rec.status, rec.body.Bytes(), nil
	}
}

type bufferedResponse struct {
	header      http.Header
	body        bytes.Buffer
	status      int
	wroteHeader bool
}

func (b *bufferedResponse) Header() http.Header { return b.header }
func (b *bufferedResponse) Write(p []byte) (int, error) {
	b.wroteHeader = true
	return b.body.Write(p)
}
func (b *bufferedResponse) WriteHeader(status int) {
	if !b.wroteHeader {
		b.status, b.wroteHeader = status, true
	}
}
