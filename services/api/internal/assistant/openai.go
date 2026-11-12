package assistant

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// OpenAI habla con la API de OpenAI (chat completions con herramientas y
// embeddings) usando HTTP plano, sin SDK.
type OpenAI struct {
	APIKey          string
	BaseURL         string // por defecto https://api.openai.com/v1
	Model           string
	EmbeddingModel  string
	ReasoningEffort string // vacío para modelos sin razonamiento
	HTTP            *http.Client
}

type Message struct {
	Role       string     `json:"role"`
	Content    *string    `json:"content"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
}

type ToolCall struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

type Tool struct {
	Type     string       `json:"type"`
	Function ToolFunction `json:"function"`
}

type ToolFunction struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Parameters  any    `json:"parameters"`
}

func text(s string) *string { return &s }

func (c *OpenAI) url(path string) string {
	base := strings.TrimRight(c.BaseURL, "/")
	if base == "" {
		base = "https://api.openai.com/v1"
	}
	return base + path
}

func (c *OpenAI) send(ctx context.Context, path string, body any) (*http.Response, error) {
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url(path), bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.APIKey)
	req.Header.Set("Content-Type", "application/json")
	client := c.HTTP
	if client == nil {
		// Sin Timeout global: una respuesta en streaming puede durar; el
		// contexto de la petición pone el límite.
		client = &http.Client{}
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 300 {
		defer resp.Body.Close()
		data, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		var e struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.Unmarshal(data, &e)
		return nil, fmt.Errorf("openai %s: %d %s", path, resp.StatusCode, e.Error.Message)
	}
	return resp, nil
}

func (c *OpenAI) post(ctx context.Context, path string, body, out any) error {
	resp, err := c.send(ctx, path, body)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return err
	}
	return json.Unmarshal(data, out)
}

// ChatStream pide una respuesta en streaming. Cada fragmento de texto se
// entrega a onText en cuanto llega; las llamadas a herramientas se acumulan y
// se devuelven completas en el mensaje final.
func (c *OpenAI) ChatStream(ctx context.Context, messages []Message, tools []Tool, onText func(string)) (Message, error) {
	body := map[string]any{"model": c.Model, "messages": messages, "stream": true}
	if len(tools) > 0 {
		body["tools"] = tools
	}
	if c.ReasoningEffort != "" {
		body["reasoning_effort"] = c.ReasoningEffort
	}
	resp, err := c.send(ctx, "/chat/completions", body)
	if err != nil {
		return Message{}, err
	}
	defer resp.Body.Close()

	var content strings.Builder
	var calls []ToolCall
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 64<<10), 4<<20)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "[DONE]" {
			break
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content   *string `json:"content"`
					ToolCalls []struct {
						Index    int    `json:"index"`
						ID       string `json:"id"`
						Function struct {
							Name      string `json:"name"`
							Arguments string `json:"arguments"`
						} `json:"function"`
					} `json:"tool_calls"`
				} `json:"delta"`
			} `json:"choices"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			return Message{}, fmt.Errorf("openai: fragmento inválido: %w", err)
		}
		if chunk.Error != nil {
			return Message{}, fmt.Errorf("openai: %s", chunk.Error.Message)
		}
		for _, choice := range chunk.Choices {
			if d := choice.Delta.Content; d != nil && *d != "" {
				content.WriteString(*d)
				if onText != nil {
					onText(*d)
				}
			}
			for _, tc := range choice.Delta.ToolCalls {
				if tc.Index < 0 || tc.Index >= 32 {
					continue
				}
				for len(calls) <= tc.Index {
					calls = append(calls, ToolCall{Type: "function"})
				}
				call := &calls[tc.Index]
				if tc.ID != "" {
					call.ID = tc.ID
				}
				call.Function.Name += tc.Function.Name
				call.Function.Arguments += tc.Function.Arguments
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return Message{}, err
	}
	msg := Message{Role: "assistant", ToolCalls: calls}
	if content.Len() > 0 {
		msg.Content = text(content.String())
	}
	return msg, nil
}

// Embed devuelve un vector por cada texto, en el mismo orden.
func (c *OpenAI) Embed(ctx context.Context, inputs []string) ([][]float32, error) {
	var out struct {
		Data []struct {
			Index     int       `json:"index"`
			Embedding []float32 `json:"embedding"`
		} `json:"data"`
	}
	if err := c.post(ctx, "/embeddings", map[string]any{"model": c.EmbeddingModel, "input": inputs}, &out); err != nil {
		return nil, err
	}
	vectors := make([][]float32, len(inputs))
	for _, d := range out.Data {
		if d.Index >= 0 && d.Index < len(vectors) {
			vectors[d.Index] = d.Embedding
		}
	}
	for i, v := range vectors {
		if v == nil {
			return nil, fmt.Errorf("openai: falta el embedding %d", i)
		}
	}
	return vectors, nil
}

// Part es un fragmento de contenido de un mensaje: texto o una imagen
// (data URL o https).
type Part struct {
	Text     string
	ImageURL string
}

// Structured pide una respuesta que cumple schema (JSON Schema estricto) y la
// decodifica en out. No usa streaming: estas respuestas son cortas y se
// validan completas antes de devolverlas.
func (c *OpenAI) Structured(ctx context.Context, system string, user []Part, name string, schema map[string]any, out any) error {
	content := make([]map[string]any, 0, len(user))
	for _, p := range user {
		if p.ImageURL != "" {
			content = append(content, map[string]any{"type": "image_url", "image_url": map[string]any{"url": p.ImageURL}})
		} else {
			content = append(content, map[string]any{"type": "text", "text": p.Text})
		}
	}
	body := map[string]any{
		"model": c.Model,
		"messages": []any{
			map[string]any{"role": "system", "content": system},
			map[string]any{"role": "user", "content": content},
		},
		"response_format": map[string]any{
			"type":        "json_schema",
			"json_schema": map[string]any{"name": name, "strict": true, "schema": schema},
		},
	}
	if c.ReasoningEffort != "" {
		body["reasoning_effort"] = c.ReasoningEffort
	}
	var resp struct {
		Choices []struct {
			Message struct {
				Content *string `json:"content"`
				Refusal *string `json:"refusal"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := c.post(ctx, "/chat/completions", body, &resp); err != nil {
		return err
	}
	if len(resp.Choices) == 0 || resp.Choices[0].Message.Content == nil {
		return fmt.Errorf("openai: respuesta vacía")
	}
	if err := json.Unmarshal([]byte(*resp.Choices[0].Message.Content), out); err != nil {
		return fmt.Errorf("openai: respuesta no cumple el formato: %w", err)
	}
	return nil
}

// StructuredTestResponse escribe value como la respuesta no streaming de
// chat completions con salida estructurada. Solo para pruebas.
func StructuredTestResponse(w http.ResponseWriter, value any) {
	data, _ := json.Marshal(value)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"role": "assistant", "content": string(data)}}}})
}
