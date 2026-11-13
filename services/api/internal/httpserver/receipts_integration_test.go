package httpserver

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"testing"
)

func TestOwnerReceiptPersistsPrivatelyWithoutAI(t *testing.T) {
	api := newTestAPI(t)
	workshop, owner, workshopPath, vehicleID, _ := publishedForOwner(t, api)
	path := "/api/v1/me/vehicles/" + vehicleID
	// Also exercises the larger body limit on manual history, beyond the default 1 MB.
	original := append([]byte("%PDF-1.4\n"), bytes.Repeat([]byte("x"), 2<<20)...)
	file := testReceiptInput("factura-privada.pdf", "application/pdf", original)
	fileJSON, _ := json.Marshal(file)
	api.req(owner, "POST", path+"/ai/receipt", `{"file":`+string(fileJSON)+`}`, 503)
	created := api.obj(owner, "POST", path+"/history", `{"performed_on":"2025-01-01","summary":"Aceite","receipt":`+string(fileJSON)+`}`, 201)
	recordID := created["id"].(string)
	downloadPath := path + "/history/" + recordID + "/receipt"
	response, err := owner.Get(api.srv.URL + downloadPath)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	got, err := io.ReadAll(response.Body)
	if err != nil || response.StatusCode != 200 || !bytes.Equal(got, original) {
		t.Fatalf("descarga: %d %v", response.StatusCode, err)
	}
	if response.Header.Get("Content-Type") != "application/pdf" || !strings.Contains(response.Header.Get("Content-Disposition"), "attachment") || response.Header.Get("Cache-Control") != "private, no-store" {
		t.Fatal(response.Header)
	}
	records := api.obj(owner, "GET", path+"/history", "", 200)["records"].([]any)
	found := false
	for _, value := range records {
		record := value.(map[string]any)
		if record["id"] == recordID {
			metadata := record["receipt"].(map[string]any)
			found = metadata["filename"] == file.Filename && metadata["size_bytes"] == float64(len(original))
			if _, ok := metadata["data"]; ok {
				t.Fatal("binario incluido en historial")
			}
		}
	}
	if !found {
		t.Fatal("falta el comprobante en el historial")
	}
	stranger := api.client()
	api.register(stranger)
	api.req(stranger, "GET", downloadPath, "", 404)
	api.req(workshop, "GET", downloadPath, "", 404)
	api.req(api.client(), "GET", downloadPath, "", 401)
	otherVehicle := api.obj(owner, "POST", "/api/v1/me/vehicles", `{"make":"Kia","model":"Rio"}`, 201)["id"].(string)
	api.req(owner, "GET", "/api/v1/me/vehicles/"+otherVehicle+"/history/"+recordID+"/receipt", "", 404)
	workshopHistory := api.raw(workshop, "GET", workshopPath+"/vehicles/"+vehicleID+"/history", "", 200)
	if bytes.Contains(workshopHistory, []byte(file.Filename)) || bytes.Contains(workshopHistory, []byte(`"receipt"`)) {
		t.Fatal("comprobante visible para taller")
	}
	report := api.obj(owner, "POST", path+"/report", "", 201)
	reportURL := report["url"].(string)
	token := reportURL[strings.LastIndex(reportURL, "/")+1:]
	public := api.raw(api.client(), "GET", "/api/v1/public/reports/"+token, "", 200)
	if bytes.Contains(public, []byte(file.Filename)) || bytes.Contains(public, []byte(`"receipt"`)) {
		t.Fatal("comprobante visible en reporte público")
	}
}

func TestReceiptPDFReadingDoesNotPersistUntilServiceIsSaved(t *testing.T) {
	api, fake := newAITestAPI(t, func(string) any {
		return map[string]any{"readable": true, "performed_on": "2025-01-01", "odometer_km": nil, "workshop_name": nil, "summary": "Aceite", "total": 10, "items": []any{}}
	})
	owner := api.client()
	api.register(owner)
	vehicleID := api.obj(owner, "POST", "/api/v1/me/vehicles", `{"make":"Kia","model":"Rio"}`, 201)["id"].(string)
	file := testReceiptInput("recibo.pdf", "application/pdf", []byte("%PDF-1.4\n%%EOF"))
	payload, _ := json.Marshal(map[string]any{"file": file})
	path := "/api/v1/me/vehicles/" + vehicleID
	api.req(owner, "POST", path+"/ai/receipt", string(payload), 200)
	if !strings.Contains(fake.last(), `"type":"file"`) || !strings.Contains(fake.last(), `"file_data":"`+file.Data+`"`) {
		t.Fatal("PDF no llegó al modelo como archivo")
	}
	var count int
	if err := api.db.QueryRow(context.Background(), "SELECT count(*) FROM history_receipt hr JOIN history_record h ON h.id=hr.history_record_id WHERE h.vehicle_id=$1", vehicleID).Scan(&count); err != nil || count != 0 {
		t.Fatalf("se guardó antes de confirmar: %d %v", count, err)
	}
	api.req(owner, "POST", path+"/history", fmt.Sprintf(`{"performed_on":"2025-01-01","summary":"Aceite","receipt":{"filename":"fake.pdf","data":%q}}`, "data:application/pdf;base64,YmFk"), 400)
	if got := api.obj(owner, "GET", path+"/history", "", 200)["total"]; got != float64(0) {
		t.Fatalf("servicio parcial: %v", got)
	}
}
