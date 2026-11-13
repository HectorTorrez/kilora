package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"
)

type Mailer interface {
	Send(ctx context.Context, to, subject, body string) error
}
type LogMailer struct{ Logger *slog.Logger }

func (m LogMailer) Send(_ context.Context, to, subject, body string) error {
	if IsDemoEmail(to) {
		return nil
	}
	m.Logger.Info("correo de desarrollo", "to", to, "subject", subject, "body", body)
	return nil
}

type ResendMailer struct {
	APIKey, From string
}

func (m ResendMailer) Send(ctx context.Context, to, subject, body string) error {
	return m.SendIdempotent(ctx, to, subject, body, "")
}

func (m ResendMailer) SendIdempotent(ctx context.Context, to, subject, body, key string) error {
	if IsDemoEmail(to) {
		return nil
	}
	data, err := json.Marshal(map[string]any{"from": m.From, "to": []string{to}, "subject": subject, "text": body})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+m.APIKey)
	req.Header.Set("Content-Type", "application/json")
	if key != "" {
		req.Header.Set("Idempotency-Key", key)
	}
	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("resend respondió %d", resp.StatusCode)
	}
	return nil
}
