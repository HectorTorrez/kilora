// Package assistant implementa el asistente de IA de Kilora: responde dudas
// sobre el producto con RAG sobre la documentación de ayuda y preguntas sobre
// los datos del usuario mediante herramientas de solo lectura que pasan por
// el API con la sesión del propio usuario.
package assistant

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

const (
	maxSteps       = 8
	maxToolResult  = 16000
	helpResults    = 4
	MaxHistory     = 20
	MaxMessageSize = 4000
)

// Fetcher ejecuta un GET del API como el usuario actual.
type Fetcher func(ctx context.Context, path string) (status int, body []byte, err error)

type Membership struct {
	WorkshopID, WorkshopName, BranchName, Role string
}

type Session struct {
	UserName         string
	Memberships      []Membership
	ActiveWorkshopID string
	Page             string
	Now              time.Time
}

type Source struct {
	Title string `json:"title"`
}

type Reply struct {
	Text    string   `json:"reply"`
	Sources []Source `json:"sources"`
}

type Agent struct {
	Client    *OpenAI
	Knowledge *Knowledge
}

func systemPrompt(s Session) string {
	var b strings.Builder
	b.WriteString(`Eres el asistente de Kilora, una aplicación que conecta talleres automotrices independientes de El Salvador con los propietarios de vehículos mediante un historial de servicio compartido.

Responde siempre en español, breve y claro, en un tono amable y profesional. Los montos son en dólares (USD).

Reglas:
- Para preguntas sobre cómo funciona Kilora usa search_help y responde solo con lo que diga la documentación. Si no está documentado, dilo.
- Para preguntas sobre datos (vehículos, órdenes, cotizaciones, clientes, historial) usa las herramientas de datos. Nunca inventes datos, fechas, montos ni IDs.
- Las herramientas devuelven solo lo que este usuario puede ver; los datos ya vienen filtrados por permisos. Si algo no aparece, explica que no tienes acceso o que no existe, sin especular.
- Eres de solo lectura: no puedes crear, editar ni borrar nada. Si el usuario quiere hacer algo, explícale dónde hacerlo en la aplicación.
- No muestres IDs internos (UUID) salvo que el usuario los pida; usa placas, números de orden y nombres.
- Para contar, usa los totales (total, counts) que devuelven las listas en vez de contar a mano una sola página.
- Formato: párrafos cortos y listas con "- ". Puedes usar **negritas**. No uses tablas ni encabezados.
`)
	fmt.Fprintf(&b, "\nFecha y hora actual: %s.\n", s.Now.Format("Monday 2006-01-02 15:04 MST"))
	fmt.Fprintf(&b, "Usuario: %s.\n", s.UserName)
	if len(s.Memberships) == 0 {
		b.WriteString("El usuario no pertenece a ningún taller; solo puede consultar sus propios vehículos como propietario.\n")
	} else {
		b.WriteString("Talleres del usuario (workshop_id — taller — sucursal — rol):\n")
		for _, m := range s.Memberships {
			fmt.Fprintf(&b, "- %s — %s — %s — %s\n", m.WorkshopID, m.WorkshopName, m.BranchName, m.Role)
		}
		if s.ActiveWorkshopID != "" {
			fmt.Fprintf(&b, "Taller activo en pantalla: %s. Úsalo por defecto.\n", s.ActiveWorkshopID)
		}
		b.WriteString("El usuario también puede tener vehículos propios (list_my_vehicles).\n")
	}
	if s.Page != "" {
		fmt.Fprintf(&b, "Página que el usuario tiene abierta: %s (los IDs en la ruta sirven de contexto, p. ej. /taller/ordenes/<order_id>, /taller/vehiculos/<vehicle_id>, /mis-vehiculos/<vehicle_id>).\n", s.Page)
	}
	return b.String()
}

// Run responde al último mensaje del usuario. history alterna user/assistant
// y termina con un mensaje del usuario.
func (a *Agent) Run(ctx context.Context, s Session, history []Message, fetch Fetcher) (Reply, error) {
	messages := append([]Message{{Role: "system", Content: text(systemPrompt(s))}}, history...)
	tools := toolDefinitions(len(s.Memberships) > 0)
	var sources []Source
	seen := map[string]bool{}

	for step := 0; ; step++ {
		offered := tools
		if step >= maxSteps {
			offered = nil // última vuelta: obliga a responder con lo que ya tiene
		}
		msg, err := a.Client.Chat(ctx, messages, offered)
		if err != nil {
			return Reply{}, err
		}
		if len(msg.ToolCalls) == 0 || offered == nil {
			reply := ""
			if msg.Content != nil {
				reply = strings.TrimSpace(*msg.Content)
			}
			if reply == "" {
				reply = "No pude generar una respuesta. Intenta reformular la pregunta."
			}
			if sources == nil {
				sources = []Source{}
			}
			return Reply{Text: reply, Sources: sources}, nil
		}
		messages = append(messages, Message{Role: "assistant", Content: msg.Content, ToolCalls: msg.ToolCalls})
		for _, call := range msg.ToolCalls {
			result, found := a.runTool(ctx, call, fetch)
			for _, f := range found {
				if !seen[f.Title] {
					seen[f.Title] = true
					sources = append(sources, f)
				}
			}
			messages = append(messages, Message{Role: "tool", ToolCallID: call.ID, Content: text(result)})
		}
	}
}

func (a *Agent) runTool(ctx context.Context, call ToolCall, fetch Fetcher) (string, []Source) {
	name, args := call.Function.Name, call.Function.Arguments
	if name == searchHelpTool {
		var in struct {
			Query string `json:"query"`
		}
		if json.Unmarshal([]byte(args), &in) != nil || strings.TrimSpace(in.Query) == "" {
			return toolError("falta query"), nil
		}
		chunks, err := a.Knowledge.Search(ctx, in.Query, helpResults)
		if err != nil {
			return toolError("la ayuda no está disponible en este momento"), nil
		}
		var b strings.Builder
		sources := make([]Source, 0, len(chunks))
		for _, c := range chunks {
			fmt.Fprintf(&b, "### %s\n%s\n\n", c.Title, c.Content)
			sources = append(sources, Source{Title: c.Title})
		}
		return b.String(), sources
	}
	path, err := ToolPath(name, args)
	if err != nil {
		return toolError(err.Error()), nil
	}
	status, body, err := fetch(ctx, path)
	if err != nil {
		return toolError("no se pudo consultar"), nil
	}
	if status >= 400 {
		var e struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(body, &e)
		return toolError(fmt.Sprintf("HTTP %d: %s", status, e.Error)), nil
	}
	if len(body) > maxToolResult {
		return string(body[:maxToolResult]) + "\n[resultado recortado; usa filtros o paginación para ver más]", nil
	}
	return string(body), nil
}

func toolError(msg string) string {
	b, _ := json.Marshal(map[string]string{"error": msg})
	return string(b)
}
