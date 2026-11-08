package main

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
)

func TestSeed(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL no definida")
	}
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(ctx)
	tx, err := conn.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if err = seed(ctx, tx, false); err != nil {
		t.Fatal(err)
	}
	var count int
	if err = tx.QueryRow(ctx, "SELECT count(*) FROM history_record h JOIN vehicle v ON v.id=h.vehicle_id WHERE v.plate='P512834'").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if err = seed(ctx, tx, false); err != nil {
		t.Fatal(err)
	}
	var again int
	if err = tx.QueryRow(ctx, "SELECT count(*) FROM history_record h JOIN vehicle v ON v.id=h.vehicle_id WHERE v.plate='P512834'").Scan(&again); err != nil || again != count {
		t.Fatalf("idempotencia: %d %d %v", count, again, err)
	}
	if err = seed(ctx, tx, true); err != nil {
		t.Fatal(err)
	}
	if err = tx.QueryRow(ctx, "SELECT count(*) FROM history_record h JOIN vehicle v ON v.id=h.vehicle_id WHERE v.plate='P512834'").Scan(&again); err != nil || again != count {
		t.Fatalf("reset: %d %d %v", count, again, err)
	}
	var data []byte
	if err = tx.QueryRow(ctx, "SELECT h.items FROM history_record h JOIN vehicle v ON v.id=h.vehicle_id WHERE v.plate='P512834' AND h.source='taller' LIMIT 1").Scan(&data); err != nil {
		t.Fatal(err)
	}
	if err != nil {
		t.Fatal(err)
	}
}
