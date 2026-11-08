package database

import (
	"context"
	"math/big"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"kilora/api/internal/database/sqlc"
)

func TestQueriesIntegration(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	q := sqlc.New(tx)
	check := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	u, err := q.CreateUser(ctx, sqlc.CreateUserParams{Email: "integration@example.test", PasswordHash: "hash", FullName: "Test"})
	check(err)
	w, err := q.CreateWorkshop(ctx, sqlc.CreateWorkshopParams{Name: "Test"})
	check(err)
	b, err := q.CreateBranch(ctx, sqlc.CreateBranchParams{WorkshopID: w.ID, Name: "Main"})
	check(err)
	_, err = q.CreateMembership(ctx, sqlc.CreateMembershipParams{UserID: u.ID, WorkshopID: w.ID, BranchID: b.ID, Role: sqlc.MembershipRoleAdmin})
	check(err)
	v, err := q.CreateVehicle(ctx, sqlc.CreateVehicleParams{CreatedByWorkshopID: &w.ID, Status: sqlc.VehicleStatusProvisional, Make: "Make", Model: "Model"})
	check(err)
	check(q.LinkVehicleToWorkshop(ctx, sqlc.LinkVehicleToWorkshopParams{VehicleID: v.ID, WorkshopID: w.ID}))
	n, err := q.NextWorkOrderNumber(ctx, w.ID)
	check(err)
	wo, err := q.CreateWorkOrder(ctx, sqlc.CreateWorkOrderParams{WorkshopID: w.ID, BranchID: b.ID, VehicleID: v.ID, Number: n, Reason: "Test", CreatedBy: u.ID})
	check(err)
	j, err := q.CreateJob(ctx, sqlc.CreateJobParams{WorkOrderID: wo.ID, WorkshopID: w.ID, Position: 1, Description: "Test", Currency: "USD"})
	check(err)
	_, err = q.CreatePart(ctx, sqlc.CreatePartParams{JobID: j.ID, WorkshopID: w.ID, Name: "Part", Quantity: pgtype.Numeric{Int: big.NewInt(1), Valid: true}, Currency: "USD"})
	check(err)
	_, err = q.CreateHistoryRecord(ctx, sqlc.CreateHistoryRecordParams{VehicleID: v.ID, WorkshopID: &w.ID, WorkOrderID: &wo.ID, Source: sqlc.HistorySourceTaller, PerformedOn: pgtype.Date{Time: time.Now(), Valid: true}, Summary: "Test", Items: []byte("[]"), Currency: "USD", CreatedBy: &u.ID})
	check(err)
	branches, err := q.ListBranchesByWorkshop(ctx, w.ID)
	check(err)
	if len(branches) != 1 {
		t.Fatal("branches")
	}
	memberships, err := q.ListMembershipsByUser(ctx, u.ID)
	check(err)
	if len(memberships) != 1 {
		t.Fatal("memberships")
	}
	orders, err := q.ListWorkOrdersByWorkshop(ctx, sqlc.ListWorkOrdersByWorkshopParams{WorkshopID: w.ID})
	check(err)
	if len(orders) != 1 {
		t.Fatal("orders")
	}
	jobs, err := q.ListJobsByWorkOrder(ctx, sqlc.ListJobsByWorkOrderParams{WorkOrderID: wo.ID, WorkshopID: w.ID})
	check(err)
	if len(jobs) != 1 {
		t.Fatal("jobs")
	}
	parts, err := q.ListPartsByWorkOrder(ctx, sqlc.ListPartsByWorkOrderParams{WorkOrderID: wo.ID, WorkshopID: w.ID})
	check(err)
	if len(parts) != 1 {
		t.Fatal("parts")
	}
	history, err := q.ListHistoryByVehicle(ctx, sqlc.ListHistoryByVehicleParams{VehicleID: v.ID, WorkshopID: w.ID})
	check(err)
	if len(history) != 1 {
		t.Fatal("history")
	}
}
