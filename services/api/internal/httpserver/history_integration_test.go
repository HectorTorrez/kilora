package httpserver

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"kilora/api/internal/database/sqlc"
)

func TestHistoryHTTP(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL no definida")
	}
	ctx := context.Background()
	db, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	srv := httptest.NewServer(NewRouter(Deps{DB: db, Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), WebOrigin: "http://localhost:3300", Mailer: &fakeMailer{}}))
	defer srv.Close()
	request := func(c *http.Client, method, path, body string, want int) []byte {
		t.Helper()
		req, _ := http.NewRequest(method, srv.URL+path, strings.NewReader(body))
		if body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		resp, e := c.Do(req)
		if e != nil {
			t.Fatal(e)
		}
		defer resp.Body.Close()
		b, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != want {
			t.Fatalf("%s: %d != %d: %s", path, resp.StatusCode, want, b)
		}
		return b
	}
	register := func() (*http.Client, uuid.UUID) {
		t.Helper()
		jar, _ := cookiejar.New(nil)
		c := &http.Client{Jar: jar}
		b := request(c, "POST", "/api/v1/auth/register", fmt.Sprintf(`{"email":%q,"password":"password123","full_name":"Prueba"}`, uuid.NewString()+"@example.com"), 201)
		var data struct {
			User struct {
				ID uuid.UUID `json:"id"`
			} `json:"user"`
			ID uuid.UUID `json:"id"`
		}
		if err := json.Unmarshal(b, &data); err != nil {
			t.Fatal(err)
		}
		id := data.User.ID
		if id == uuid.Nil {
			id = data.ID
		}
		if id == uuid.Nil {
			t.Fatalf("id ausente: %s", b)
		}
		return c, id
	}
	a, aid := register()
	b, _ := register()
	c, _ := register()
	owner, oid := register()
	other, _ := register()
	workshop := func(client *http.Client) uuid.UUID {
		data := request(client, "POST", "/api/v1/workshops", `{"name":"Taller","branch_name":"Principal"}`, 201)
		var v struct {
			ID uuid.UUID `json:"id"`
		}
		if e := json.Unmarshal(data, &v); e != nil {
			t.Fatal(e)
		}
		return v.ID
	}
	wa, wb, wc := workshop(a), workshop(b), workshop(c)
	q := sqlc.New(db)
	vehicle, err := q.CreateVehicle(ctx, sqlc.CreateVehicleParams{OwnerUserID: &oid, CreatedByWorkshopID: &wa, Status: sqlc.VehicleStatusVinculado, Make: "Marca", Model: "Modelo"})
	if err != nil {
		t.Fatal(err)
	}
	for _, wid := range []uuid.UUID{wa, wb} {
		if err = q.LinkVehicleToWorkshop(ctx, sqlc.LinkVehicleToWorkshopParams{VehicleID: vehicle.ID, WorkshopID: wid}); err != nil {
			t.Fatal(err)
		}
	}
	secret := "interno-" + uuid.NewString()
	price := "98765.43"
	var cost pgtype.Numeric
	if err = cost.Scan("12345.67"); err != nil {
		t.Fatal(err)
	}
	_, err = q.CreateHistoryRecord(ctx, sqlc.CreateHistoryRecordParams{VehicleID: vehicle.ID, WorkshopID: &wa, Source: sqlc.HistorySourceTaller, PerformedOn: pgtype.Date{Time: time.Now(), Valid: true}, Summary: "Servicio", Items: []byte(fmt.Sprintf(`[{"kind":"pieza","description":"filtro","price":%q,"internal_cost":%q,"mechanic_notes":%q}]`, price, secret, secret)), Currency: "USD", InternalCost: cost, InternalNotes: &secret, CreatedBy: &aid})
	if err != nil {
		t.Fatal(err)
	}
	vehicleID := vehicle.ID.String()
	path := func(w uuid.UUID) string {
		return "/api/v1/workshops/" + w.String() + "/vehicles/" + vehicleID + "/history"
	}
	ab := request(a, "GET", path(wa), "", 200)
	if !strings.Contains(string(ab), secret) {
		t.Fatalf("autor sin interno: %s", ab)
	}
	bb := request(b, "GET", path(wb), "", 200)
	for _, v := range []string{secret, price, "12345.67", wa.String(), "internal_cost", "mechanic_notes"} {
		if strings.Contains(string(bb), v) {
			t.Errorf("ciego contiene %s: %s", v, bb)
		}
	}
	ob := request(owner, "GET", "/api/v1/me/vehicles/"+vehicleID+"/history", "", 200)
	if strings.Contains(string(ob), secret) || strings.Contains(string(ob), "12345.67") || !strings.Contains(string(ob), price) {
		t.Errorf("propietario: %s", ob)
	}
	request(c, "GET", path(wc), "", 404)
	request(other, "GET", "/api/v1/me/vehicles/"+vehicleID+"/history", "", 404)
}
