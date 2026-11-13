package auth

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"
)

func TestMailersNeverSendToDemoRecipients(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	resend := ResendMailer{APIKey: "unused", From: "Kilora <notifications@example.com>"}
	for _, email := range []string{DemoOwnerEmail, DemoWorkshopEmail, "recepcion@demo.kilora.app", DemoRivalEmail, "  PRUEBA@DEMO.KILORA.APP  "} {
		if err := resend.Send(ctx, email, "Prueba", "No enviar"); err != nil {
			t.Fatalf("demo reached HTTP delivery: %s: %v", email, err)
		}
		if err := resend.SendIdempotent(ctx, email, "Prueba", "No enviar", "test-key"); err != nil {
			t.Fatalf("demo reached idempotent delivery: %s: %v", email, err)
		}
	}
	if err := resend.Send(ctx, "owner@example.com", "Prueba", "Normal"); err == nil {
		t.Fatal("normal recipient was suppressed instead of using cancelled HTTP request")
	}
	var output bytes.Buffer
	logMailer := LogMailer{Logger: slog.New(slog.NewTextHandler(&output, nil))}
	if err := logMailer.Send(context.Background(), DemoOwnerEmail, "Prueba", "No enviar"); err != nil {
		t.Fatal(err)
	}
	if output.Len() != 0 {
		t.Fatal("demo email was logged as sent")
	}
	if err := logMailer.Send(context.Background(), "owner@example.com", "Prueba", "Normal"); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output.String(), "owner@example.com") {
		t.Fatal("normal development mail was suppressed")
	}
}
