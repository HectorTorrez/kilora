package httpserver

import (
	"bytes"
	"encoding/base64"
	"mime"
	"net/http"
	"path"
	"strings"
	"unicode"

	"kilora/api/internal/database/sqlc"
)

const maxReceiptFile = 4 << 20

type receiptInput struct {
	Filename string `json:"filename"`
	Data     string `json:"data"`
}

type receiptFile struct {
	filename    string
	contentType string
	data        []byte
}

func decodeReceiptFile(input receiptInput) (receiptFile, error) {
	invalid := badRequest("Usá un comprobante JPG, PNG, WebP o PDF de hasta 4 MB.")
	header, encoded, ok := strings.Cut(input.Data, ",")
	contentType := strings.TrimSuffix(strings.TrimPrefix(header, "data:"), ";base64")
	if !ok || header != "data:"+contentType+";base64" || len(encoded) > base64.StdEncoding.EncodedLen(maxReceiptFile) {
		return receiptFile{}, invalid
	}
	switch contentType {
	case "image/jpeg", "image/png", "image/webp", "application/pdf":
	default:
		return receiptFile{}, invalid
	}
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(raw) == 0 || len(raw) > maxReceiptFile {
		return receiptFile{}, invalid
	}
	if contentType == "application/pdf" {
		if !bytes.HasPrefix(raw, []byte("%PDF-")) {
			return receiptFile{}, invalid
		}
	} else if http.DetectContentType(raw) != contentType {
		return receiptFile{}, invalid
	}
	filename := path.Base(strings.ReplaceAll(strings.TrimSpace(input.Filename), "\\", "/"))
	if filename == "." || filename == "/" || filename == "" || len([]rune(filename)) > 180 || strings.ContainsFunc(filename, unicode.IsControl) {
		return receiptFile{}, badRequest("El nombre del comprobante no es válido")
	}
	return receiptFile{filename: filename, contentType: contentType, data: raw}, nil
}

func (s *server) downloadOwnerReceipt(w http.ResponseWriter, r *http.Request) error {
	recordID, err := pathID(r, "recordID", "Comprobante no encontrado")
	if err != nil {
		return err
	}
	vehicleID, err := pathID(r, "vehicleID", vehicleNotFound)
	if err != nil {
		return err
	}
	user := currentUser(r.Context()).ID
	receipt, err := sqlc.New(s.db).GetHistoryReceiptForOwner(r.Context(), sqlc.GetHistoryReceiptForOwnerParams{RecordID: recordID, VehicleID: vehicleID, OwnerUserID: &user})
	if err != nil {
		return notFoundIfMissing(err, "Comprobante no encontrado")
	}
	w.Header().Set("Content-Type", receipt.ContentType)
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": receipt.Filename}))
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, err = w.Write(receipt.Data)
	return err
}
