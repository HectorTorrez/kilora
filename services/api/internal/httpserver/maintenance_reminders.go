package httpserver

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"kilora/api/internal/auth"
	"kilora/api/internal/database/sqlc"
)

// RunMaintenanceReminders checks on startup and hourly until ctx is cancelled.
// It is owned by the API lifecycle, rather than an HTTP request or router.
func RunMaintenanceReminders(ctx context.Context, d Deps) {
	if d.Logger == nil {
		d.Logger = slog.Default()
	}
	if d.Mailer == nil {
		d.Mailer = auth.LogMailer{Logger: d.Logger}
	}
	s := &server{db: d.DB, logger: d.Logger, mailer: d.Mailer, origin: d.WebOrigin}
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for {
		if err := s.sendMaintenanceReminders(ctx, time.Now()); err != nil && ctx.Err() == nil {
			s.logger.Error("recordatorios de mantenimiento", "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (s *server) sendMaintenanceReminders(ctx context.Context, now time.Time) error {
	ids, err := sqlc.New(s.db).ListMaintenanceReminderVehicles(ctx, timestamptz(now.AddDate(0, 0, -7)))
	if err != nil {
		return err
	}
	for _, id := range ids {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		jobCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		err := s.sendMaintenanceReminder(jobCtx, id, now)
		cancel()
		if err != nil {
			s.logger.Error("enviar recordatorio", "vehicle_id", id, "error", err)
		}
	}
	return nil
}

func (s *server) sendMaintenanceReminder(ctx context.Context, id uuid.UUID, now time.Time) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	q := sqlc.New(tx)
	// Hold the preference lock until delivery is recorded, so replicas cannot send
	// the same digest concurrently and opting out is serialized with delivery.
	target, err := q.LockMaintenanceReminder(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if auth.IsDemoEmail(target.Email) || (target.LastSentAt.Valid && now.Before(target.LastSentAt.Time.AddDate(0, 0, 7))) {
		return nil
	}
	plan, err := loadOwnerMaintenance(ctx, q, id, *target.OwnerUserID, now)
	if err != nil {
		return err
	}
	body, send := maintenanceReminderBody(plan, target.Make+" "+target.Model, strings.TrimRight(s.origin, "/")+"/mis-vehiculos/"+id.String())
	if !send {
		return nil
	}
	// A mileage-only reminder is monthly; maintenance digests are at most weekly.
	hasDue := false
	for _, item := range plan.Items {
		if item.Status == "proximo" || item.Status == "vencido" {
			hasDue = true
		}
	}
	if !hasDue && target.LastSentAt.Valid && now.Before(target.LastSentAt.Time.AddDate(0, 0, 30)) {
		return nil
	}
	key := fmt.Sprintf("maintenance/%s/%s", id, target.LastSentAt.Time.UTC().Format(time.RFC3339Nano))
	subject := "Tu próximo mantenimiento en Kilora"
	if mailer, ok := s.mailer.(interface {
		SendIdempotent(context.Context, string, string, string, string) error
	}); ok {
		err = mailer.SendIdempotent(ctx, target.Email, subject, body, key)
	} else {
		err = s.mailer.Send(ctx, target.Email, subject, body)
	}
	if err != nil {
		return err
	}
	if err = q.MarkMaintenanceReminderSent(ctx, sqlc.MarkMaintenanceReminderSentParams{VehicleID: id, SentAt: timestamptz(now)}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func maintenanceReminderBody(plan ownerMaintenancePlan, vehicle, url string) (string, bool) {
	lines := []string{"Hola. Este es el recordatorio de mantenimiento de tu " + vehicle + ".", ""}
	hasDue := false
	for _, item := range plan.Items {
		if item.Status != "proximo" && item.Status != "vencido" {
			continue
		}
		hasDue = true
		status := "Se acerca la revisión"
		if item.Status == "vencido" {
			status = "Revisión pendiente"
		}
		line := status + " de " + strings.ToLower(item.Label) + "."
		if item.DueDate != nil {
			line += " Fecha de referencia: " + *item.DueDate + "."
		}
		if item.DueKm != nil {
			line += fmt.Sprintf(" Kilometraje de referencia: %s km.", thousands(*item.DueKm))
		}
		lines = append(lines, line)
	}
	if plan.OdometerStale {
		lines = append(lines, "", "Actualizá el kilometraje para mantener tus estimaciones al día.")
	}
	if !hasDue && !plan.OdometerStale {
		return "", false
	}
	lines = append(lines, "", "Estas son estimaciones basadas en tu historial y los intervalos configurados. Seguí el manual del fabricante y la indicación de tu taller.", "", "Ver el plan y desactivar estos correos: "+url)
	return strings.Join(lines, "\n"), true
}
