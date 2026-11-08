package values

import "testing"

func TestPlate(t *testing.T) {
	if got := Plate(" p - 123 "); got != "P123" {
		t.Fatal(got)
	}
}

func TestPhone(t *testing.T) {
	for _, input := range []string{"77778888", "+503 7777-8888", "50377778888"} {
		if got, ok := Phone(input); !ok || got != "+50377778888" {
			t.Fatal(input, got)
		}
	}
	if _, ok := Phone("123"); ok {
		t.Fatal("teléfono inválido aceptado")
	}
}

func TestMoneyRejectsWhatTheDatabaseCannotStore(t *testing.T) {
	for _, input := range []string{"1e20", "12345678901", "-1", "1.234", ""} {
		if _, ok := Money(input); ok {
			t.Fatal(input)
		}
	}
	for _, input := range []string{"0", "1234567890.50", "00012.5"} {
		if _, ok := Money(input); !ok {
			t.Fatal(input)
		}
	}
}

func TestQuantityMustBePositive(t *testing.T) {
	if _, ok := Quantity("0"); ok {
		t.Fatal("cantidad cero aceptada")
	}
	if _, ok := Quantity("00000000012345678.5"); !ok {
		t.Fatal("los ceros a la izquierda no cuentan como dígitos")
	}
}

func TestPastDateRejectsTomorrow(t *testing.T) {
	today := Today()
	if _, ok := PastDate(today.Format(DateLayout)); !ok {
		t.Fatal("hoy debe ser válido")
	}
	if _, ok := PastDate(today.AddDate(0, 0, 1).Format(DateLayout)); ok {
		t.Fatal("mañana no debe ser válido")
	}
}
