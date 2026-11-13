package httpserver

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/png"
	"strings"
	"testing"
)

func testReceiptInput(filename, contentType string, data []byte) receiptInput {
	return receiptInput{Filename: filename, Data: "data:" + contentType + ";base64," + base64.StdEncoding.EncodeToString(data)}
}

func TestReceiptFileValidation(t *testing.T) {
	var pngData bytes.Buffer
	if err := png.Encode(&pngData, image.NewRGBA(image.Rect(0, 0, 1, 1))); err != nil {
		t.Fatal(err)
	}
	for _, input := range []receiptInput{
		testReceiptInput("recibo.pdf", "application/pdf", []byte("%PDF-1.4\n%%EOF")),
		testReceiptInput("recibo.png", "image/png", pngData.Bytes()),
	} {
		got, err := decodeReceiptFile(input)
		if err != nil || len(got.data) == 0 || got.filename != input.Filename {
			t.Fatalf("%s: %v", input.Filename, err)
		}
	}
	for name, input := range map[string]receiptInput{
		"empty":        testReceiptInput("recibo.pdf", "application/pdf", nil),
		"oversize":     testReceiptInput("recibo.pdf", "application/pdf", make([]byte, maxReceiptFile+1)),
		"fake_pdf":     testReceiptInput("recibo.pdf", "application/pdf", []byte("<html>")),
		"fake_png":     testReceiptInput("recibo.png", "image/png", []byte("%PDF-1.4")),
		"unsupported":  testReceiptInput("recibo.svg", "image/svg+xml", []byte("<svg/>")),
		"control_name": testReceiptInput("recibo\n.pdf", "application/pdf", []byte("%PDF-1.4")),
		"long_name":    testReceiptInput(strings.Repeat("a", 181), "application/pdf", []byte("%PDF-1.4")),
		"base64":       {Filename: "recibo.pdf", Data: "data:application/pdf;base64,***"},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := decodeReceiptFile(input); err == nil {
				t.Fatal("archivo inválido aceptado")
			}
		})
	}
}
