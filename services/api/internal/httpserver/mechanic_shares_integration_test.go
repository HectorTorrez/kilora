package httpserver

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"kilora/api/internal/auth"
	"kilora/api/internal/database/sqlc"
)

func mechanicPublicPath(created map[string]any) string {
	link := created["url"].(string)
	return "/api/v1/public/mechanic-shares/" + link[strings.LastIndex(link, "/")+1:]
}

func TestMechanicShareSelectionPrivacyAndLifecycle(t *testing.T) {
	api := newTestAPI(t)
	workshop, owner, _, vehicleID, _ := publishedForOwner(t, api)
	path := "/api/v1/me/vehicles/" + vehicleID
	endpoint := path + "/mechanic-share"
	anonymous, other := api.client(), api.client()
	api.register(other)
	api.req(anonymous, "GET", endpoint, "", 401)
	api.req(other, "GET", endpoint, "", 404)
	api.req(workshop, "DELETE", endpoint, "", 404)
	if api.obj(owner, "GET", endpoint, "", 200)["active"] != nil {
		t.Fatal("unexpected active share")
	}
	records := api.obj(owner, "GET", path+"/history", "", 200)["records"].([]any)
	recordID := records[0].(map[string]any)["id"].(string)
	file, _ := json.Marshal(testReceiptInput("private-receipt.pdf", "application/pdf", []byte("%PDF-1.4\nPRIVATE_RECEIPT")))
	private := api.obj(owner, "POST", path+"/history", `{"performed_on":"2024-02-01","summary":"Cambio de batería oculto","receipt":`+string(file)+`,"total":"99.99"}`, 201)
	changes := []byte(`{"summary":"Cambio de aceite corregido","odometer_km":45000,"items":[{"kind":"pieza","description":"Filtro","category":"aceite","brand":"Marca visible","price":"88.88","internal_cost":"PRIVATE_COST","mechanic_notes":"PRIVATE_NOTES"}],"workshop_notes":"PRIVATE_PUBLIC_NOTE","internal_notes":"PRIVATE_INTERNAL_NOTE"}`)
	if _, err := api.q.CreateCorrection(context.Background(), sqlc.CreateCorrectionParams{HistoryRecordID: uuid.MustParse(recordID), Reason: "PRIVATE_REASON", Changes: changes, CreatedBy: mustUser(t, api, workshop)}); err != nil {
		t.Fatal(err)
	}

	body := fmt.Sprintf(`{"record_ids":[%q],"include_maintenance":true}`, recordID)
	api.req(other, "POST", endpoint, body, 404)
	for _, invalid := range []string{`{}`, `{"record_ids":[]}`, `{"record_ids":["invalid"]}`, fmt.Sprintf(`{"record_ids":[%q,%q]}`, recordID, recordID), fmt.Sprintf(`{"record_ids":[%q]}`, uuid.NewString())} {
		api.req(owner, "POST", endpoint, invalid, 400)
	}
	secondVehicle := api.obj(owner, "POST", "/api/v1/me/vehicles", `{"make":"Kia","model":"Rio"}`, 201)["id"].(string)
	foreign := api.obj(owner, "POST", "/api/v1/me/vehicles/"+secondVehicle+"/history", `{"performed_on":"2024-01-01","summary":"Otro vehículo"}`, 201)["id"].(string)
	api.req(owner, "POST", endpoint, fmt.Sprintf(`{"record_ids":[%q]}`, foreign), 400)
	report := api.obj(owner, "POST", path+"/report", "", 201)
	created := api.obj(owner, "POST", endpoint, body, 201)
	publicPath := mechanicPublicPath(created)
	raw := api.raw(anonymous, "GET", publicPath, "", 200)
	for _, hidden := range []string{"secreto", "PRIVATE", "88.88", "99.99", "12.50", "3.00", "internal_cost", "mechanic_notes", "workshop_notes", "created_by", "receipt", "email_reminders", "Cambio de batería oculto", private["id"].(string)} {
		if bytes.Contains(raw, []byte(hidden)) {
			t.Fatalf("public response leaked %s: %s", hidden, raw)
		}
	}
	var public map[string]any
	if err := json.Unmarshal(raw, &public); err != nil {
		t.Fatal(err)
	}
	if len(public["records"].([]any)) != 1 || public["records"].([]any)[0].(map[string]any)["summary"] != "Cambio de aceite corregido" {
		t.Fatal(string(raw))
	}
	items := public["maintenance"].([]any)
	if len(items) != 1 || items[0].(map[string]any)["category"] != "aceite" || items[0].(map[string]any)["due_km"] != float64(50000) {
		t.Fatal(string(raw))
	}
	response, err := anonymous.Get(api.srv.URL + publicPath)
	if err != nil {
		t.Fatal(err)
	}
	io.Copy(io.Discard, response.Body)
	response.Body.Close()
	if response.Header.Get("Cache-Control") != "no-store" || response.Header.Get("Referrer-Policy") != "no-referrer" || !strings.Contains(response.Header.Get("X-Robots-Tag"), "noindex") {
		t.Fatal(response.Header)
	}
	share, err := api.q.GetActiveMechanicShare(context.Background(), uuid.MustParse(vehicleID))
	token := publicPath[strings.LastIndex(publicPath, "/")+1:]
	if err != nil || share.TokenHash != auth.HashToken(token) || strings.Contains(string(api.raw(owner, "GET", endpoint, "", 200)), token) {
		t.Fatalf("unsafe token storage/status: %v", err)
	}
	if expires, _ := time.Parse(time.RFC3339, created["expires_at"].(string)); time.Until(expires) < 6*24*time.Hour || time.Until(expires) > mechanicShareValidity {
		t.Fatal("unexpected validity")
	}
	api.req(owner, "POST", path+"/history", `{"performed_on":"2024-03-01","summary":"Cambio de llantas nuevo"}`, 201)
	if strings.Contains(string(api.raw(anonymous, "GET", publicPath, "", 200)), "llantas nuevo") {
		t.Fatal("new services automatically shared")
	}
	replacement := api.obj(owner, "POST", endpoint, fmt.Sprintf(`{"record_ids":[%q]}`, private["id"]), 201)
	api.req(anonymous, "GET", publicPath, "", 404)
	replacementRaw := api.raw(anonymous, "GET", mechanicPublicPath(replacement), "", 200)
	if bytes.Contains(replacementRaw, []byte("receipt")) || bytes.Contains(replacementRaw, []byte("99.99")) {
		t.Fatal("selected owner receipt/amount leaked")
	}
	var withoutMaintenance map[string]any
	if err := json.Unmarshal(replacementRaw, &withoutMaintenance); err != nil {
		t.Fatal(err)
	}
	if withoutMaintenance["maintenance"] != nil || withoutMaintenance["current_odometer_km"] != nil {
		t.Fatal("maintenance shared without consent")
	}
	// Mechanic sharing must not replace or revoke the independent resale link.
	reportURL := report["url"].(string)
	api.req(anonymous, "GET", "/api/v1/public/reports/"+reportURL[strings.LastIndex(reportURL, "/")+1:], "", 200)
	api.req(owner, "DELETE", endpoint, "", 204)
	api.req(anonymous, "GET", mechanicPublicPath(replacement), "", 404)
	if api.obj(owner, "GET", endpoint, "", 200)["active"] != nil {
		t.Fatal("revoked share active")
	}
	expired := api.obj(owner, "POST", endpoint, body, 201)
	if _, err = api.db.Exec(context.Background(), "UPDATE vehicle_mechanic_share SET expires_at = now() - interval '1 minute' WHERE vehicle_id = $1", uuid.MustParse(vehicleID)); err != nil {
		t.Fatal(err)
	}
	api.req(anonymous, "GET", mechanicPublicPath(expired), "", 404)
	lostOwner := api.obj(owner, "POST", endpoint, body, 201)
	if _, err = api.db.Exec(context.Background(), "UPDATE vehicle SET owner_user_id = NULL WHERE id = $1", uuid.MustParse(vehicleID)); err != nil {
		t.Fatal(err)
	}
	api.req(anonymous, "GET", mechanicPublicPath(lostOwner), "", 404)
	api.req(anonymous, "GET", "/api/v1/public/mechanic-shares/invalid", "", 404)
}

func TestMechanicShareConcurrentReplacement(t *testing.T) {
	api := newTestAPI(t)
	owner := api.client()
	api.register(owner)
	vehicle := api.obj(owner, "POST", "/api/v1/me/vehicles", `{"make":"Toyota","model":"Corolla"}`, 201)["id"].(string)
	path := "/api/v1/me/vehicles/" + vehicle
	record := api.obj(owner, "POST", path+"/history", `{"performed_on":"2024-01-01","summary":"Aceite"}`, 201)["id"].(string)
	body := fmt.Sprintf(`{"record_ids":[%q]}`, record)
	var wg sync.WaitGroup
	results := make(chan string, 2)
	for range 2 {
		wg.Go(func() {
			request, _ := http.NewRequest("POST", api.srv.URL+path+"/mechanic-share", strings.NewReader(body))
			request.Header.Set("Origin", testOrigin)
			request.Header.Set("Content-Type", "application/json")
			response, err := owner.Do(request)
			if err != nil {
				t.Error(err)
				return
			}
			defer response.Body.Close()
			var created map[string]any
			if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
				t.Error(err)
				return
			}
			if response.StatusCode != 201 {
				t.Errorf("create: %v", created)
				return
			}
			results <- mechanicPublicPath(created)
		})
	}
	wg.Wait()
	close(results)
	live := 0
	for path := range results {
		response, err := api.client().Get(api.srv.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode == 200 {
			live++
		} else if response.StatusCode != 404 {
			t.Fatal(response.StatusCode)
		}
	}
	if live != 1 {
		t.Fatalf("%d links still active", live)
	}
}

func TestLastServicesUseCompleteCorrectedHistory(t *testing.T) {
	api := newTestAPI(t)
	owner := api.client()
	user, _ := api.register(owner)
	v := api.obj(owner, "POST", "/api/v1/me/vehicles", `{"make":"Toyota","model":"Corolla"}`, 201)
	id := uuid.MustParse(v["id"].(string))
	path := "/api/v1/me/vehicles/" + id.String()
	oldest := api.obj(owner, "POST", path+"/history", `{"performed_on":"2020-01-01","summary":"Cambio de aceite","odometer_km":20000}`, 201)
	for i := range 105 {
		if _, err := api.q.CreateHistoryRecord(context.Background(), sqlc.CreateHistoryRecordParams{VehicleID: id, Source: sqlc.HistorySourcePropietario, PerformedOn: date(time.Date(2021, 1, 1, 0, 0, 0, 0, time.UTC).AddDate(0, 0, i)), Summary: "Limpieza general", Items: []byte("[]"), Currency: "USD", CreatedBy: &user}); err != nil {
			t.Fatal(err)
		}
	}
	api.req(owner, "POST", path+"/corrections", fmt.Sprintf(`{"history_record_id":%q,"reason":"Fecha y trabajo corregidos","changes":{"performed_on":"2022-01-01","summary":"Cambio de batería","odometer_km":25000}}`, oldest["id"]), 201)
	plan := api.obj(owner, "GET", path+"/maintenance", "", 200)
	battery := maintenanceItem(t, plan, "bateria")
	if battery["last_performed_on"] != "2022-01-01" || battery["last_odometer_km"] != float64(25000) || battery["last_summary"] != "Cambio de batería" {
		t.Fatalf("corrections ignored: %+v", battery)
	}
	if maintenanceItem(t, plan, "aceite")["last_performed_on"] != nil {
		t.Fatal("uncorrected category shown")
	}
}
