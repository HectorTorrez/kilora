package httpserver

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"testing"
)

func TestOwnerServiceDuplicateDetailsAndExplicitOverride(t *testing.T) {
	api := newTestAPI(t)
	owner := api.client()
	api.register(owner)
	vehicle := api.obj(owner, "POST", "/api/v1/me/vehicles", `{"make":"Toyota","model":"Corolla"}`, 201)["id"].(string)
	path := "/api/v1/me/vehicles/" + vehicle + "/history"
	body := `{"performed_on":"2026-01-10","summary":"Cambio de aceite","workshop_name_text":"Taller El Árbol","total":"25.00","odometer_km":40000}`
	first := api.obj(owner, "POST", path, body, 201)
	duplicateBody := `{"performed_on":"2026-01-10","summary":"Otro texto del mismo servicio","workshop_name_text":"  TALLER EL ARBOL  ","total":"25","odometer_km":40000}`
	warning := api.obj(owner, "POST", path, duplicateBody, 409)
	matches := warning["duplicates"].([]any)
	if len(matches) != 1 || matches[0].(map[string]any)["id"] != first["id"] || matches[0].(map[string]any)["reason"] != "details" {
		t.Fatal(warning)
	}
	var historyCount, readingCount, auditCount int
	ctx := context.Background()
	if err := api.db.QueryRow(ctx, `SELECT count(*) FROM history_record WHERE vehicle_id=$1`, vehicle).Scan(&historyCount); err != nil {
		t.Fatal(err)
	}
	if err := api.db.QueryRow(ctx, `SELECT count(*) FROM odometer_reading WHERE vehicle_id=$1`, vehicle).Scan(&readingCount); err != nil {
		t.Fatal(err)
	}
	if err := api.db.QueryRow(ctx, `SELECT count(*) FROM audit_event WHERE entity='history_record' AND entity_id=$1`, first["id"]).Scan(&auditCount); err != nil {
		t.Fatal(err)
	}
	if historyCount != 1 || readingCount != 1 || auditCount != 1 {
		t.Fatalf("warning persisted data: %d %d %d", historyCount, readingCount, auditCount)
	}
	confirmed := strings.TrimSuffix(duplicateBody, "}") + `,"allow_duplicate":true}`
	api.req(owner, "POST", path, confirmed, 201)
	// Missing price or workshop, or different details, must not block normal entry.
	for _, body := range []string{
		`{"performed_on":"2026-01-10","summary":"Sin monto","workshop_name_text":"Taller El Árbol"}`,
		`{"performed_on":"2026-01-10","summary":"Sin taller","total":"25.00"}`,
		`{"performed_on":"2026-01-11","summary":"Otra fecha","workshop_name_text":"Taller El Árbol","total":"25.00"}`,
		`{"performed_on":"2026-01-10","summary":"Otro monto","workshop_name_text":"Taller El Árbol","total":"26.00"}`,
	} {
		api.req(owner, "POST", path, body, 201)
	}
}

func TestOwnerDuplicateReceiptHashAndPrivacy(t *testing.T) {
	api := newTestAPI(t)
	workshop, owner, _, vehicle, _ := publishedForOwner(t, api)
	path := "/api/v1/me/vehicles/" + vehicle + "/history"
	original := []byte("%PDF-1.4\nA private original receipt\n%%EOF")
	file := testReceiptInput("recibo.pdf", "application/pdf", original)
	fileJSON, _ := json.Marshal(file)
	body := `{"performed_on":"2025-01-01","summary":"Servicio manual","receipt":` + string(fileJSON) + `}`
	created := api.obj(owner, "POST", path, body, 201)
	// Renaming the same bytes and changing entered details still detects the file.
	renamed := testReceiptInput("renombrado.pdf", "application/pdf", original)
	renamedJSON, _ := json.Marshal(renamed)
	warning := api.raw(owner, "POST", path, `{"performed_on":"2025-02-01","summary":"Otra fecha","receipt":`+string(renamedJSON)+`}`, 409)
	var result struct {
		Duplicates []duplicateService `json:"duplicates"`
	}
	if err := json.Unmarshal(warning, &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Duplicates) != 1 || result.Duplicates[0].ID.String() != created["id"] || result.Duplicates[0].Reason != "receipt" {
		t.Fatal(string(warning))
	}
	if bytes.Contains(warning, []byte("JVBER")) || bytes.Contains(warning, []byte("content_hash")) || bytes.Contains(warning, []byte("receipt.data")) {
		t.Fatal("receipt content leaked")
	}
	var receiptCount int
	if err := api.db.QueryRow(context.Background(), `SELECT count(*) FROM history_receipt r JOIN history_record h ON h.id=r.history_record_id WHERE h.vehicle_id=$1`, vehicle).Scan(&receiptCount); err != nil || receiptCount != 1 {
		t.Fatalf("receipt persisted on warning: %d %v", receiptCount, err)
	}
	// No warning reveals that the same file belongs to another owner's vehicle.
	stranger := api.client()
	api.register(stranger)
	other := api.obj(stranger, "POST", "/api/v1/me/vehicles", `{"make":"Kia","model":"Rio"}`, 201)["id"].(string)
	api.req(stranger, "POST", "/api/v1/me/vehicles/"+other+"/history", body, 201)
	api.req(stranger, "POST", path, body, 404)
	api.req(workshop, "POST", path, body, 404)
	// A same-name file with other content is a different receipt.
	otherFile, _ := json.Marshal(testReceiptInput("recibo.pdf", "application/pdf", []byte("%PDF-1.4\nDifferent receipt\n%%EOF")))
	api.req(owner, "POST", path, `{"performed_on":"2025-01-01","summary":"Otro comprobante","receipt":`+string(otherFile)+`}`, 201)
	api.req(owner, "POST", path, strings.TrimSuffix(body, "}")+`,"allow_duplicate":true}`, 201)
}

func TestDuplicateWarningForPublishedWorkshopServiceOmitsPrivateFields(t *testing.T) {
	api := newTestAPI(t)
	_, owner, _, vehicle, _ := publishedForOwner(t, api)
	ctx := context.Background()
	var on, name, total string
	if err := api.db.QueryRow(ctx, `SELECT h.performed_on::text,w.name,h.total::text FROM history_record h JOIN workshop w ON w.id=h.workshop_id WHERE h.vehicle_id=$1 LIMIT 1`, vehicle).Scan(&on, &name, &total); err != nil {
		t.Fatal(err)
	}
	body := fmt.Sprintf(`{"performed_on":%q,"summary":"Manual copy","workshop_name_text":%q,"total":%q}`, on, name, total)
	warning := api.raw(owner, "POST", "/api/v1/me/vehicles/"+vehicle+"/history", body, 409)
	for _, hidden := range []string{"internal_cost", "internal_notes", "mechanic_notes", "secreto"} {
		if strings.Contains(string(warning), hidden) {
			t.Fatal(string(warning))
		}
	}
}

func TestConcurrentOwnerServiceSavesDoNotBypassDuplicateWarning(t *testing.T) {
	api := newTestAPI(t)
	owner := api.client()
	api.register(owner)
	vehicle := api.obj(owner, "POST", "/api/v1/me/vehicles", `{"make":"Toyota","model":"Corolla"}`, 201)["id"].(string)
	body := `{"performed_on":"2026-01-10","summary":"Aceite","workshop_name_text":"Taller","total":"30.00"}`
	statuses := make(chan int, 2)
	failures := make(chan error, 2)
	var wg sync.WaitGroup
	start := make(chan struct{})
	for range 2 {
		wg.Go(func() {
			<-start
			req, err := http.NewRequest("POST", api.srv.URL+"/api/v1/me/vehicles/"+vehicle+"/history", strings.NewReader(body))
			if err != nil {
				failures <- err
				return
			}
			req.Header.Set("Origin", testOrigin)
			req.Header.Set("Content-Type", "application/json")
			response, err := owner.Do(req)
			if err != nil {
				failures <- err
				return
			}
			defer response.Body.Close()
			statuses <- response.StatusCode
		})
	}
	close(start)
	wg.Wait()
	close(statuses)
	close(failures)
	for err := range failures {
		t.Fatal(err)
	}
	counts := map[int]int{}
	for status := range statuses {
		counts[status]++
	}
	if counts[201] != 1 || counts[409] != 1 {
		t.Fatalf("concurrent statuses: %+v", counts)
	}
}
