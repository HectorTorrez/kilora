package httpserver

import (
	"strings"

	"kilora/api/internal/database/sqlc"
)

const invalidPart = "Pieza inválida"

// partCategories es el catálogo de piezas que el taller elige al registrar un
// trabajo o un ítem de cotización. Cada pieza pertenece a una categoría, así
// la ficha del vehículo sigue agrupando por zona aunque nadie elija categoría.
// La web tiene el mismo catálogo con textos y dibujos (lib/part-catalog.ts).
var partCategories = map[string]sqlc.PartCategory{
	"aceite_motor":              sqlc.PartCategoryAceite,
	"filtro_aceite":             sqlc.PartCategoryAceite,
	"filtro_aire":               sqlc.PartCategoryMotor,
	"bujias":                    sqlc.PartCategoryMotor,
	"correa_distribucion":       sqlc.PartCategoryMotor,
	"banda_accesorios":          sqlc.PartCategoryMotor,
	"inyectores":                sqlc.PartCategoryMotor,
	"filtro_combustible":        sqlc.PartCategoryMotor,
	"refrigerante":              sqlc.PartCategoryRefrigeracion,
	"radiador":                  sqlc.PartCategoryRefrigeracion,
	"termostato":                sqlc.PartCategoryRefrigeracion,
	"bomba_agua":                sqlc.PartCategoryRefrigeracion,
	"gas_ac":                    sqlc.PartCategoryAireAcondicionado,
	"compresor_ac":              sqlc.PartCategoryAireAcondicionado,
	"filtro_cabina":             sqlc.PartCategoryAireAcondicionado,
	"bateria":                   sqlc.PartCategoryBateria,
	"alternador":                sqlc.PartCategoryElectrico,
	"motor_arranque":            sqlc.PartCategoryElectrico,
	"faros":                     sqlc.PartCategoryElectrico,
	"luces_traseras":            sqlc.PartCategoryElectrico,
	"aceite_transmision":        sqlc.PartCategoryTransmision,
	"embrague":                  sqlc.PartCategoryTransmision,
	"flechas":                   sqlc.PartCategoryTransmision,
	"cardan":                    sqlc.PartCategoryTransmision,
	"diferencial":               sqlc.PartCategoryTransmision,
	"cremallera":                sqlc.PartCategoryDireccion,
	"terminales_direccion":      sqlc.PartCategoryDireccion,
	"liquido_direccion":         sqlc.PartCategoryDireccion,
	"pastillas_delanteras":      sqlc.PartCategoryFrenos,
	"pastillas_traseras":        sqlc.PartCategoryFrenos,
	"discos_delanteros":         sqlc.PartCategoryFrenos,
	"discos_traseros":           sqlc.PartCategoryFrenos,
	"zapatas_traseras":          sqlc.PartCategoryFrenos,
	"liquido_frenos":            sqlc.PartCategoryFrenos,
	"amortiguadores_delanteros": sqlc.PartCategoryAmortiguadores,
	"amortiguadores_traseros":   sqlc.PartCategoryAmortiguadores,
	"ballestas":                 sqlc.PartCategoryAmortiguadores,
	"llantas_delanteras":        sqlc.PartCategoryLlantas,
	"llantas_traseras":          sqlc.PartCategoryLlantas,
	"alineacion_balanceo":       sqlc.PartCategoryLlantas,
	"catalizador":               sqlc.PartCategoryEscape,
	"silenciador":               sqlc.PartCategoryEscape,
	"parabrisas":                sqlc.PartCategoryCarroceria,
	"plumillas":                 sqlc.PartCategoryCarroceria,
	"espejos":                   sqlc.PartCategoryCarroceria,
	"pintura":                   sqlc.PartCategoryCarroceria,
}

// resolvePart normaliza la pieza elegida: vacía es ninguna, desconocida es un
// error y, si no se indicó categoría, toma la de la pieza.
func resolvePart(part *string, category *sqlc.PartCategory) (*string, *sqlc.PartCategory, error) {
	if part == nil || strings.TrimSpace(*part) == "" {
		return nil, category, nil
	}
	key := strings.TrimSpace(*part)
	c, ok := partCategories[key]
	if !ok {
		return nil, nil, badRequest(invalidPart)
	}
	if category == nil {
		category = &c
	}
	return &key, category, nil
}
