package notifications

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"kilora/api/internal/database/sqlc"
)

type Target struct {
	BranchID *uuid.UUID
	Phone    *string
	Workshop string
}

func FindTarget(ctx context.Context, db sqlc.DBTX, workshop uuid.UUID, kind, hash string) (Target, error) {
	var t Target
	err := db.QueryRow(ctx, `
 WITH targets AS (
 SELECT 'tracking' AS kind, s.token_hash, wo.workshop_id, wo.branch_id, c.phone
 FROM work_order_tracking_share s JOIN work_order wo ON wo.id=s.work_order_id
 LEFT JOIN vehicle_link l ON l.vehicle_id=wo.vehicle_id AND l.workshop_id=wo.workshop_id
 LEFT JOIN customer c ON c.id=l.customer_id WHERE s.expires_at>now()
 UNION ALL
 SELECT 'quote', q.share_token_hash, q.workshop_id, q.branch_id, COALESCE(q.customer_phone,c.phone)
 FROM quote q LEFT JOIN work_order wo ON wo.id=q.work_order_id
 LEFT JOIN vehicle_link l ON l.vehicle_id=wo.vehicle_id AND l.workshop_id=wo.workshop_id
 LEFT JOIN customer c ON c.id=l.customer_id WHERE q.share_expires_at>now()
 UNION ALL
 SELECT 'invitation', i.token_hash, i.workshop_id, NULL::uuid, c.phone
 FROM invitation i JOIN vehicle_link l ON l.vehicle_id=i.vehicle_id AND l.workshop_id=i.workshop_id
 LEFT JOIN customer c ON c.id=l.customer_id
 WHERE i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now()
 ) SELECT t.branch_id, t.phone, w.name FROM targets t JOIN workshop w ON w.id=t.workshop_id
 WHERE t.workshop_id=$1 AND t.kind=$2 AND t.token_hash=$3`, workshop, kind, hash).Scan(&t.BranchID, &t.Phone, &t.Workshop)
	return t, err
}

type Notification struct {
	ID        uuid.UUID `json:"id"`
	Status    string    `json:"status"`
	ErrorCode *string   `json:"error_code"`
}

func Enqueue(ctx context.Context, db sqlc.DBTX, workshop uuid.UUID, kind, hash, phone string, target Target, parameters []string) (Notification, error) {
	payload, err := json.Marshal(parameters)
	if err != nil {
		return Notification{}, err
	}
	var n Notification
	err = db.QueryRow(ctx, `INSERT INTO whatsapp_notification(workshop_id,branch_id,kind,token_hash,recipient,parameters)
 VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(workshop_id,kind,token_hash) DO UPDATE SET token_hash=excluded.token_hash
 RETURNING id,status,error_code`, workshop, target.BranchID, kind, hash, phone, payload).Scan(&n.ID, &n.Status, &n.ErrorCode)
	return n, err
}

func Run(ctx context.Context, db *pgxpool.Pool, sender Sender, logger *slog.Logger) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		if err := Process(ctx, db, sender); err != nil && ctx.Err() == nil {
			logger.Error("procesar WhatsApp", "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// A stale in-flight send is ambiguous: never automatically resend it.
func Process(ctx context.Context, db *pgxpool.Pool, sender Sender) error {
	_, err := db.Exec(ctx, `UPDATE whatsapp_notification SET status='unknown',error_code='interrupted',parameters='[]',recipient='',updated_at=now() WHERE status='sending' AND updated_at<now()-interval '2 minutes'`)
	if err != nil {
		return err
	}
	for range 20 {
		if err = processOne(ctx, db, sender); errors.Is(err, pgx.ErrNoRows) {
			return nil
		} else if err != nil {
			return err
		}
	}
	return nil
}
func processOne(ctx context.Context, db *pgxpool.Pool, sender Sender) error {
	var id, workshop uuid.UUID
	var kind, hash, recipient string
	var payload []byte
	var attempts int
	err := db.QueryRow(ctx, `UPDATE whatsapp_notification SET status='sending',attempts=attempts+1,updated_at=now()
 WHERE id=(SELECT id FROM whatsapp_notification WHERE status='queued' AND available_at<=now() ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1)
 RETURNING id,workshop_id,kind,token_hash,recipient,parameters,attempts`).Scan(&id, &workshop, &kind, &hash, &recipient, &payload, &attempts)
	if err != nil {
		return err
	}
	status, code, messageID := "cancelled", "link_unavailable", ""
	target, targetErr := FindTarget(ctx, db, workshop, kind, hash)
	if targetErr != nil && !errors.Is(targetErr, pgx.ErrNoRows) {
		// No external send has occurred, so a database read failure is safe to retry.
		_, err = db.Exec(ctx, `UPDATE whatsapp_notification SET status='queued',available_at=now()+interval '30 seconds',updated_at=now() WHERE id=$1`, id)
		return err
	}
	phone := ""
	if target.Phone != nil {
		phone, _ = Phone(*target.Phone)
	}
	retry := false
	if targetErr == nil && phone == recipient {
		var parameters []string
		if json.Unmarshal(payload, &parameters) != nil {
			status, code = "failed", "invalid_payload"
		} else {
			sendCtx, cancel := context.WithTimeout(ctx, 25*time.Second)
			messageID, err = sender.Send(sendCtx, kind, recipient, parameters)
			cancel()
			status, code = "accepted", ""
			if err != nil {
				status, code = "failed", "send_error"
				var se *SendError
				if errors.As(err, &se) {
					code = se.Code
					if se.Uncertain {
						status = "unknown"
					}
					retry = se.Retry && attempts < 5
				}
				if retry {
					status = "queued"
				}
			}
		}
	}
	// Complete bookkeeping even when shutdown cancelled the provider request.
	saveCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	_, err = db.Exec(saveCtx, `UPDATE whatsapp_notification SET status=$2,error_code=NULLIF($3,''),provider_message_id=NULLIF($4,''),updated_at=now(),available_at=now()+$5*interval '1 second',parameters=CASE WHEN $2='queued' THEN parameters ELSE '[]'::jsonb END,recipient=CASE WHEN $2='queued' THEN recipient ELSE '' END WHERE id=$1`, id, status, code, messageID, 30*(1<<min(attempts, 6)))
	return err
}
