package httpserver

import (
	"encoding/json"
	"os"
	"slices"
	"testing"

	"kilora/api/internal/database/sqlc"
)

func TestResolvePart(t *testing.T) {
	empty := " "
	if p, c, err := resolvePart(&empty, nil); err != nil || p != nil || c != nil {
		t.Fatalf("pieza vacía: %v %v %v", p, c, err)
	}
	key := "pastillas_delanteras"
	p, c, err := resolvePart(&key, nil)
	if err != nil || *p != key || *c != sqlc.PartCategoryFrenos {
		t.Fatalf("debía tomar la categoría de la pieza: %v %v %v", p, c, err)
	}
	other := sqlc.PartCategoryOtro
	if _, c, _ = resolvePart(&key, &other); *c != sqlc.PartCategoryOtro {
		t.Fatalf("debía respetar la categoría elegida: %v", *c)
	}
	bad := "turbo_encabezador"
	if _, _, err = resolvePart(&bad, nil); err == nil {
		t.Fatal("pieza desconocida debía fallar")
	}
}

// El catálogo de la API y el enum PartKey del contrato deben coincidir.
func TestPartCatalogMatchesContract(t *testing.T) {
	data, err := os.ReadFile("../../../../packages/contracts/openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}
	var spec struct {
		Components struct {
			Schemas struct {
				PartKey struct {
					Enum []string `json:"enum"`
				} `json:"PartKey"`
			} `json:"schemas"`
		} `json:"components"`
	}
	if err := json.Unmarshal(data, &spec); err != nil {
		t.Fatal(err)
	}
	documented := spec.Components.Schemas.PartKey.Enum
	if len(documented) != len(partCategories) {
		t.Fatalf("contrato %d piezas, API %d", len(documented), len(partCategories))
	}
	for key, category := range partCategories {
		if !slices.Contains(documented, key) {
			t.Errorf("pieza %q falta en el contrato", key)
		}
		if !category.Valid() {
			t.Errorf("pieza %q con categoría inválida", key)
		}
	}
}
