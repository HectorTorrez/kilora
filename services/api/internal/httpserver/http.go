package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"kilora/api/internal/database"
	"kilora/api/internal/database/sqlc"
)

const internalErrorMessage = "Error interno"

type httpError struct {
	status  int
	message string
}

func (e httpError) Error() string { return e.message }

func badRequest(msg string) error { return httpError{http.StatusBadRequest, msg} }
func forbidden(msg string) error  { return httpError{http.StatusForbidden, msg} }
func notFound(msg string) error   { return httpError{http.StatusNotFound, msg} }
func conflict(msg string) error   { return httpError{http.StatusConflict, msg} }

var errAccessDenied = forbidden("Acceso denegado")

func notFoundIfMissing(err error, msg string) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(msg)
	}
	return err
}

func isUniqueViolation(err error) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == "23505"
}

type handler func(w http.ResponseWriter, r *http.Request) error

func (s *server) handle(fn handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		err := fn(w, r)
		if err == nil {
			return
		}
		var he httpError
		if errors.As(err, &he) {
			fail(w, he.status, he.message)
			return
		}
		s.logger.Error("error interno", "method", r.Method, "path", r.URL.Path, "error", err)
		fail(w, http.StatusInternalServerError, internalErrorMessage)
	}
}

func fail(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func decode(r *http.Request, v any) error {
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		return badRequest("JSON inválido")
	}
	if err := d.Decode(&struct{}{}); err != io.EOF {
		return badRequest("JSON inválido")
	}
	return nil
}

func pathID(r *http.Request, param, missing string) (uuid.UUID, error) {
	id, err := uuid.Parse(chi.URLParam(r, param))
	if err != nil {
		return uuid.Nil, notFound(missing)
	}
	return id, nil
}

func (s *server) tx(ctx context.Context, fn func(q *sqlc.Queries) error) error {
	return database.WithTx(ctx, s.db, fn)
}

type auditEvent struct {
	actor    uuid.UUID
	workshop *uuid.UUID
	entity   string
	id       uuid.UUID
	action   string
}

func recordAudit(ctx context.Context, q *sqlc.Queries, e auditEvent) error {
	_, err := q.InsertAuditEvent(ctx, sqlc.InsertAuditEventParams{ActorUserID: &e.actor, WorkshopID: e.workshop, Entity: e.entity, EntityID: &e.id, Action: e.action})
	return err
}

// mutate commits a change together with its audit event; every mutation of sensitive data goes through it.
func (s *server) mutate(ctx context.Context, fn func(q *sqlc.Queries) (auditEvent, error)) error {
	return s.tx(ctx, func(q *sqlc.Queries) error {
		event, err := fn(q)
		if err != nil {
			return err
		}
		return recordAudit(ctx, q, event)
	})
}

// retryNumbered reruns a transaction that picks the next MAX(number)+1 when a concurrent insert took it.
func retryNumbered(fn func() error) error {
	var err error
	for attempt := 0; attempt < 3; attempt++ {
		if err = fn(); !isUniqueViolation(err) {
			return err
		}
	}
	return err
}

func pathToken(r *http.Request) string { return chi.URLParam(r, "token") }
