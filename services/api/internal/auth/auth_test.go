package auth

import "testing"

func TestPassword(t *testing.T) {
	if _, err := HashPassword("short"); err == nil {
		t.Fatal("contraseña corta aceptada")
	}
	h, err := HashPassword("contraseña segura")
	if err != nil || !VerifyPassword("contraseña segura", h) || VerifyPassword("incorrecta", h) || VerifyPassword("a", "malformado") {
		t.Fatal("hash o verificación inválida", err)
	}
}
func TestToken(t *testing.T) {
	a, err := NewToken()
	if err != nil {
		t.Fatal(err)
	}
	b, err := NewToken()
	if err != nil {
		t.Fatal(err)
	}
	if len(a) != 43 || a == b || len(HashToken(a)) != 64 || HashToken(a) == HashToken(b) {
		t.Fatal("tokens inválidos")
	}
}
