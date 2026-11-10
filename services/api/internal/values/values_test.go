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
	for input, want := range map[string]string{"+1 (212) 555-0123": "+12125550123", "+52 55 1234 5678": "+525512345678"} {
		if got, ok := Phone(input); !ok || got != want {
			t.Fatal(input, got)
		}
	}
	for _, input := range []string{"123", "+503 1234", "+1 000 000 0000", "abc"} {
		if _, ok := Phone(input); ok {
			t.Fatal("teléfono inválido aceptado", input)
		}
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

func TestPersonalNames(t *testing.T) {
	for _, name := range []string{"María José", "Ana-María", "O'Connor", "D’Arcy", "José Núñez", "J. R. Pérez"} {
		if !PersonName(name) {
			t.Errorf("nombre válido rechazado: %q", name)
		}
	}
	for _, name := range []string{"", "123", "Ana123", "Ana@Pérez", "---", "Ana\nPérez"} {
		if PersonName(name) {
			t.Errorf("nombre inválido aceptado: %q", name)
		}
	}
}

func TestVehicleInputs(t *testing.T) {
	for _, model := range []string{"911", "CX-5", "F-150", "C 200", "Citroën", "Model 3"} {
		if !VehicleText(model) {
			t.Errorf("modelo válido rechazado: %q", model)
		}
	}
	for _, model := range []string{"", "---", "Toyota<script>", "BMW🚗", "Toyota\nFord"} {
		if VehicleText(model) {
			t.Errorf("modelo inválido aceptado: %q", model)
		}
	}
	for _, plate := range []string{"", " p-123 ", "P123456"} {
		if !ValidPlate(&plate) {
			t.Errorf("placa válida rechazada: %q", plate)
		}
	}
	for _, plate := range []string{"P@123", "🚗123", "AB", "P1234567890123"} {
		if ValidPlate(&plate) {
			t.Errorf("placa inválida aceptada: %q", plate)
		}
	}
}

func TestVehicleYearBounds(t *testing.T) {
	for _, year := range []int32{1886, int32(Today().Year() + 1)} {
		if !ValidYear(&year) {
			t.Errorf("año válido rechazado: %d", year)
		}
	}
	for _, year := range []int32{1885, int32(Today().Year() + 2)} {
		if ValidYear(&year) {
			t.Errorf("año inválido aceptado: %d", year)
		}
	}
}

func TestOptionalNIT(t *testing.T) {
	for _, input := range []string{"0614-010190-101-1", "06140101901011", "01234567-8", " "} {
		if _, ok := OptionalNIT(&input); !ok {
			t.Fatal(input)
		}
	}
	for _, input := range []string{"123", "0614-0101", "ABC123456", "0614-010190-101-12"} {
		if _, ok := OptionalNIT(&input); ok {
			t.Fatal(input)
		}
	}
}
