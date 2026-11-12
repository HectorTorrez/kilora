package assistant

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"kilora/api/internal/database/sqlc"
)

// Las herramientas de datos no consultan la base directamente: se traducen a
// una ruta GET del propio API y se ejecutan con la sesión del usuario. Así el
// asistente ve exactamente lo que el usuario ve en la aplicación, con los
// mismos permisos por taller y sucursal y la misma proyección del historial.

const searchHelpTool = "search_help"

type toolSpec struct {
	name, description string
	workshop          bool                                      // requiere workshop_id
	params            map[string]any                            // propiedades JSON Schema, además de workshop_id
	required          []string                                  // además de workshop_id
	path              func(args map[string]any) (string, error) // ruta relativa a /api/v1
}

func str(desc string) map[string]any { return map[string]any{"type": "string", "description": desc} }
func integer(desc string) map[string]any {
	return map[string]any{"type": "integer", "description": desc, "minimum": 0}
}
func enumList(desc string, values ...string) map[string]any {
	return map[string]any{"type": "array", "description": desc, "items": map[string]any{"type": "string", "enum": values}}
}

var (
	orderStatuses  = []string{"recibido", "diagnostico", "en_reparacion", "listo", "cancelado"}
	quoteOutcomes  = []string{"pendiente", "acepto", "rechazo", "no_respondio"}
	vehicleStatus  = []string{"provisional", "vinculado"}
	recommendation = []string{"pendiente", "hecha", "descartada"}
	pageParams     = map[string]any{"offset": integer("Desplazamiento para paginar (de 50 en 50).")}
)

func merge(maps ...map[string]any) map[string]any {
	out := map[string]any{}
	for _, m := range maps {
		for k, v := range m {
			out[k] = v
		}
	}
	return out
}

var dataTools = []toolSpec{
	{
		name:        "list_my_vehicles",
		description: "Lista los vehículos del usuario como propietario, con su último servicio y kilometraje.",
		path:        func(map[string]any) (string, error) { return "/me/vehicles", nil },
	},
	{
		name:        "get_my_vehicle",
		description: "Detalle de un vehículo propio: datos, lecturas de kilometraje, talleres vinculados y recomendaciones.",
		params:      map[string]any{"vehicle_id": str("ID del vehículo (de list_my_vehicles).")},
		required:    []string{"vehicle_id"},
		path:        func(a map[string]any) (string, error) { return withID("/me/vehicles/%s", a, "vehicle_id") },
	},
	{
		name:        "get_my_vehicle_history",
		description: "Historial de servicios de un vehículo propio, del más reciente al más antiguo, 50 por página.",
		params:      merge(map[string]any{"vehicle_id": str("ID del vehículo.")}, pageParams),
		required:    []string{"vehicle_id"},
		path: func(a map[string]any) (string, error) {
			p, err := withID("/me/vehicles/%s/history", a, "vehicle_id")
			return withQuery(p, a, err, page)
		},
	},
	{
		name:        "get_workshop",
		description: "Datos del taller y sus sucursales.",
		workshop:    true,
		path:        func(map[string]any) (string, error) { return "/", nil },
	},
	{
		name:        "list_work_orders",
		description: "Busca órdenes de trabajo del taller. Devuelve una página y los totales por estado (counts), útil para contar.",
		workshop:    true,
		params: merge(map[string]any{
			"status":    enumList("Filtrar por estados. Abiertas = recibido, diagnostico, en_reparacion.", orderStatuses...),
			"q":         str("Texto a buscar: placa, número de orden o motivo."),
			"from":      str("Fecha de recepción desde, AAAA-MM-DD."),
			"to":        str("Fecha de recepción hasta, AAAA-MM-DD."),
			"branch_id": str("ID de sucursal."),
		}, pageParams),
		path: func(a map[string]any) (string, error) {
			return withQuery("/work-orders/page", a, nil, enums("status", orderStatuses), search, dates, optionalID("branch_id"), page)
		},
	},
	{
		name:        "get_work_order",
		description: "Detalle de una orden: vehículo, estado, trabajos, piezas, costos y notas.",
		workshop:    true,
		params:      map[string]any{"order_id": str("ID de la orden.")},
		required:    []string{"order_id"},
		path:        func(a map[string]any) (string, error) { return withID("/work-orders/%s", a, "order_id") },
	},
	{
		name:        "get_work_order_quote",
		description: "Cotización asociada a una orden, con sus ítems, total y resultado.",
		workshop:    true,
		params:      map[string]any{"order_id": str("ID de la orden.")},
		required:    []string{"order_id"},
		path:        func(a map[string]any) (string, error) { return withID("/work-orders/%s/quote", a, "order_id") },
	},
	{
		name:        "list_vehicles",
		description: "Busca vehículos del taller por placa, marca, modelo o cliente.",
		workshop:    true,
		params: merge(map[string]any{
			"status": enumList("Filtrar por estado.", vehicleStatus...),
			"q":      str("Texto a buscar."),
		}, pageParams),
		path: func(a map[string]any) (string, error) {
			return withQuery("/vehicles/page", a, nil, enums("status", vehicleStatus), search, page)
		},
	},
	{
		name:        "get_vehicle",
		description: "Ficha de un vehículo del taller: datos, cliente, lecturas de kilometraje y órdenes.",
		workshop:    true,
		params:      map[string]any{"vehicle_id": str("ID del vehículo.")},
		required:    []string{"vehicle_id"},
		path:        func(a map[string]any) (string, error) { return withID("/vehicles/%s", a, "vehicle_id") },
	},
	{
		name:        "get_vehicle_history",
		description: "Historial de servicios del vehículo visto por este taller (los registros de otros talleres llegan en vista ciega).",
		workshop:    true,
		params:      map[string]any{"vehicle_id": str("ID del vehículo.")},
		required:    []string{"vehicle_id"},
		path:        func(a map[string]any) (string, error) { return withID("/vehicles/%s/history", a, "vehicle_id") },
	},
	{
		name:        "list_vehicle_recommendations",
		description: "Recomendaciones de un vehículo (pendientes, hechas o descartadas).",
		workshop:    true,
		params:      map[string]any{"vehicle_id": str("ID del vehículo.")},
		required:    []string{"vehicle_id"},
		path:        func(a map[string]any) (string, error) { return withID("/vehicles/%s/recommendations", a, "vehicle_id") },
	},
	{
		name:        "list_recommendations",
		description: "Recomendaciones de todos los vehículos del taller.",
		workshop:    true,
		params:      map[string]any{"status": map[string]any{"type": "string", "enum": recommendation}},
		path: func(a map[string]any) (string, error) {
			return withQuery("/recommendations", a, nil, func(a map[string]any, v url.Values) error {
				s, _ := a["status"].(string)
				if s == "" {
					return nil
				}
				if !sqlc.RecommendationStatus(s).Valid() {
					return fmt.Errorf("estado inválido: %s", s)
				}
				v.Set("status", s)
				return nil
			})
		},
	},
	{
		name:        "list_customers",
		description: "Busca clientes del taller por nombre o teléfono.",
		workshop:    true,
		params:      merge(map[string]any{"q": str("Nombre o teléfono.")}, pageParams),
		path:        func(a map[string]any) (string, error) { return withQuery("/customers/page", a, nil, search, page) },
	},
	{
		name:        "get_customer",
		description: "Datos de un cliente y sus vehículos.",
		workshop:    true,
		params:      map[string]any{"customer_id": str("ID del cliente.")},
		required:    []string{"customer_id"},
		path:        func(a map[string]any) (string, error) { return withID("/customers/%s", a, "customer_id") },
	},
	{
		name:        "list_quotes",
		description: "Busca cotizaciones de mostrador. Devuelve una página y los totales por resultado (counts).",
		workshop:    true,
		params: merge(map[string]any{
			"outcome": enumList("Filtrar por resultado.", quoteOutcomes...),
			"q":       str("Texto a buscar: cliente, placa o número."),
			"from":    str("Fecha desde, AAAA-MM-DD."),
			"to":      str("Fecha hasta, AAAA-MM-DD."),
		}, pageParams),
		path: func(a map[string]any) (string, error) {
			return withQuery("/quotes", a, nil, enums("outcome", quoteOutcomes), search, dates, page)
		},
	},
	{
		name:        "get_quote",
		description: "Detalle de una cotización de mostrador.",
		workshop:    true,
		params:      map[string]any{"quote_id": str("ID de la cotización.")},
		required:    []string{"quote_id"},
		path:        func(a map[string]any) (string, error) { return withID("/quotes/%s", a, "quote_id") },
	},
	{
		name:        "list_members",
		description: "Miembros del equipo del taller con su rol y sucursal.",
		workshop:    true,
		path:        func(map[string]any) (string, error) { return "/members", nil },
	},
}

func toolByName(name string) (toolSpec, bool) {
	for _, t := range dataTools {
		if t.name == name {
			return t, true
		}
	}
	return toolSpec{}, false
}

// toolDefinitions arma las herramientas que se ofrecen al modelo; las de
// taller solo si el usuario pertenece a alguno.
func toolDefinitions(withWorkshop bool) []Tool {
	tools := []Tool{{Type: "function", Function: ToolFunction{
		Name:        searchHelpTool,
		Description: "Busca en la documentación de ayuda de Kilora: cómo se usa, qué significa cada estado, privacidad, roles. Úsala para cualquier pregunta sobre el producto.",
		Parameters:  object(map[string]any{"query": str("Pregunta o tema a buscar.")}, []string{"query"}),
	}}}
	for _, t := range dataTools {
		if t.workshop && !withWorkshop {
			continue
		}
		props, required := t.params, t.required
		if t.workshop {
			props = merge(map[string]any{"workshop_id": str("ID del taller (de la lista de talleres del usuario).")}, props)
			required = append([]string{"workshop_id"}, required...)
		}
		tools = append(tools, Tool{Type: "function", Function: ToolFunction{Name: t.name, Description: t.description, Parameters: object(props, required)}})
	}
	return tools
}

func object(props map[string]any, required []string) map[string]any {
	if props == nil {
		props = map[string]any{}
	}
	if required == nil {
		required = []string{}
	}
	return map[string]any{"type": "object", "properties": props, "required": required, "additionalProperties": false}
}

// ToolPath valida los argumentos de una herramienta de datos y devuelve la
// ruta GET absoluta del API que la resuelve.
func ToolPath(name, rawArgs string) (string, error) {
	t, ok := toolByName(name)
	if !ok {
		return "", fmt.Errorf("herramienta desconocida: %s", name)
	}
	args := map[string]any{}
	if strings.TrimSpace(rawArgs) != "" {
		if err := json.Unmarshal([]byte(rawArgs), &args); err != nil {
			return "", fmt.Errorf("argumentos inválidos")
		}
	}
	rel, err := t.path(args)
	if err != nil {
		return "", err
	}
	if !t.workshop {
		return "/api/v1" + rel, nil
	}
	workshop, err := idArg(args, "workshop_id")
	if err != nil {
		return "", err
	}
	return "/api/v1/workshops/" + workshop + rel, nil
}

func idArg(a map[string]any, key string) (string, error) {
	s, _ := a[key].(string)
	id, err := uuid.Parse(strings.TrimSpace(s))
	if err != nil {
		return "", fmt.Errorf("%s inválido", key)
	}
	return id.String(), nil
}

func withID(format string, a map[string]any, key string) (string, error) {
	id, err := idArg(a, key)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf(format, id), nil
}

type queryPart func(a map[string]any, v url.Values) error

func withQuery(path string, a map[string]any, err error, parts ...queryPart) (string, error) {
	if err != nil {
		return "", err
	}
	v := url.Values{}
	for _, p := range parts {
		if err := p(a, v); err != nil {
			return "", err
		}
	}
	if len(v) == 0 {
		return path, nil
	}
	return path + "?" + v.Encode(), nil
}

func page(a map[string]any, v url.Values) error {
	v.Set("limit", "50")
	if n, ok := a["offset"].(float64); ok && n > 0 {
		v.Set("offset", strconv.Itoa(int(n)))
	}
	return nil
}

func search(a map[string]any, v url.Values) error {
	if s, _ := a["q"].(string); strings.TrimSpace(s) != "" {
		v.Set("q", strings.TrimSpace(s))
	}
	return nil
}

func dates(a map[string]any, v url.Values) error {
	for _, key := range []string{"from", "to"} {
		s, _ := a[key].(string)
		if s == "" {
			continue
		}
		if _, err := time.Parse(time.DateOnly, s); err != nil {
			return fmt.Errorf("%s debe tener formato AAAA-MM-DD", key)
		}
		v.Set(key, s)
	}
	return nil
}

func enums(key string, allowed []string) queryPart {
	return func(a map[string]any, v url.Values) error {
		list, _ := a[key].([]any)
		for _, item := range list {
			s, _ := item.(string)
			ok := false
			for _, x := range allowed {
				ok = ok || x == s
			}
			if !ok {
				return fmt.Errorf("%s inválido: %v", key, item)
			}
			v.Add(key, s)
		}
		return nil
	}
}

func optionalID(key string) queryPart {
	return func(a map[string]any, v url.Values) error {
		if s, _ := a[key].(string); s == "" {
			return nil
		}
		id, err := idArg(a, key)
		if err != nil {
			return err
		}
		v.Set(key, id)
		return nil
	}
}
