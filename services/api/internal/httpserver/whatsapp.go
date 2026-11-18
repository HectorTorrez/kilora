package httpserver

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/google/uuid"
	"kilora/api/internal/auth"
	"kilora/api/internal/database/sqlc"
	"kilora/api/internal/notifications"
)

func (s *server) whatsAppConfig(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	w.Header().Set("Cache-Control", "no-store")
	enabled := !auth.IsDemoEmail(currentUser(r.Context()).Email)
	writeJSON(w, http.StatusOK, map[string]bool{"quote": enabled && s.whatsapp.Enabled("quote"), "tracking": enabled && s.whatsapp.Enabled("tracking"), "invitation": enabled && s.whatsapp.Enabled("invitation")})
	return nil
}

func notificationLink(origin, raw string) (kind, token string, err error) {
	base, e := url.Parse(origin)
	if e != nil {
		return "", "", badRequest("Enlace inválido")
	}
	link, e := url.Parse(raw)
	if e != nil || link.Scheme != base.Scheme || link.Host != base.Host || link.User != nil || link.RawQuery != "" || link.Fragment != "" || link.RawPath != "" {
		return "", "", badRequest("Enlace inválido")
	}
	parts := strings.Split(strings.TrimPrefix(link.Path, "/"), "/")
	if len(parts) != 2 || len(parts[1]) != 43 {
		return "", "", badRequest("Enlace inválido")
	}
	switch parts[0] {
	case "c":
		kind = "quote"
	case "estado":
		kind = "tracking"
	case "invitacion":
		kind = "invitation"
	default:
		return "", "", badRequest("Enlace inválido")
	}
	return kind, parts[1], nil
}

func (s *server) sendWhatsApp(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	w.Header().Set("Cache-Control", "no-store")
	if auth.IsDemoEmail(currentUser(r.Context()).Email) {
		return forbidden("El envío no está disponible en cuentas de demostración")
	}
	if err := wc.requireWriter(); err != nil {
		return err
	}
	var in struct {
		URL string `json:"url"`
	}
	if err := decode(r, &in); err != nil {
		return err
	}
	if len(in.URL) > 2048 {
		return badRequest("Enlace inválido")
	}
	kind, token, err := notificationLink(s.origin, in.URL)
	if err != nil {
		return err
	}
	if !s.whatsapp.Enabled(kind) {
		return httpError{http.StatusServiceUnavailable, "El envío por WhatsApp todavía no está configurado"}
	}
	var n notifications.Notification
	// The outbox insert and audit record commit together before any external send.
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	hash := auth.HashToken(token)
	target, err := notifications.FindTarget(r.Context(), tx, wc.workshopID, kind, hash)
	if err != nil {
		return notFoundIfMissing(err, "Enlace no disponible")
	}
	if target.BranchID != nil {
		if err = wc.requireBranchWriter(*target.BranchID); err != nil {
			return err
		}
	}
	if target.Phone == nil {
		return badRequest("Agregá el teléfono del cliente antes de enviar")
	}
	phone, err := notifications.Phone(*target.Phone)
	if err != nil {
		return badRequest("El teléfono del cliente debe incluir un código de país válido")
	}
	n, err = notifications.Enqueue(r.Context(), tx, wc.workshopID, kind, hash, phone, target, []string{target.Workshop, in.URL})
	if err != nil {
		return err
	}
	if err = recordAudit(r.Context(), sqlc.New(tx), wc.event("whatsapp_notification", n.ID, "whatsapp.queued")); err != nil {
		return err
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	writeJSON(w, http.StatusAccepted, n)
	return nil
}

func (s *server) getWhatsAppNotification(w http.ResponseWriter, r *http.Request, wc workshopAccess) error {
	w.Header().Set("Cache-Control", "no-store")
	id, err := pathID(r, "notificationID", "Notificación no encontrada")
	if err != nil {
		return err
	}
	var n notifications.Notification
	var branch *uuid.UUID
	err = s.db.QueryRow(r.Context(), `SELECT id,status,error_code,branch_id FROM whatsapp_notification WHERE id=$1 AND workshop_id=$2`, id, wc.workshopID).Scan(&n.ID, &n.Status, &n.ErrorCode, &branch)
	if err != nil {
		return notFoundIfMissing(err, "Notificación no encontrada")
	}
	if branch != nil && !wc.canReadBranch(*branch) {
		return notFound("Notificación no encontrada")
	}
	if branch == nil && len(wc.branchIDs) == 0 {
		return notFound("Notificación no encontrada")
	}
	writeJSON(w, http.StatusOK, n)
	return nil
}
