package assistant

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
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

func (c *OpenAI) post(ctx context.Context, path string, body, out any) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url(path), bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.APIKey)
	req.Header.Set("Content-Type", "application/json")
	client := c.HTTP
	if client == nil {
		client = &http.Client{Timeout: 90 * time.Second}
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode >= 300 {
		var e struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.Unmarshal(data, &e)
		return fmt.Errorf("openai %s: %d %s", path, resp.StatusCode, e.Error.Message)
	}
	return json.Unmarshal(data, out)
}

// Chat pide una respuesta; puede devolver texto o llamadas a herramientas.
func (c *OpenAI) Chat(ctx context.Context, messages []Message, tools []Tool) (Message, error) {
	body := map[string]any{"model": c.Model, "messages": messages}
	if len(tools) > 0 {
		body["tools"] = tools
	}
	if c.ReasoningEffort != "" {
		body["reasoning_effort"] = c.ReasoningEffort
	}
	var out struct {
		Choices []struct {
			Message Message `json:"message"`
		} `json:"choices"`
	}
	if err := c.post(ctx, "/chat/completions", body, &out); err != nil {
		return Message{}, err
	}
	if len(out.Choices) == 0 {
		return Message{}, fmt.Errorf("openai: respuesta sin opciones")
	}
	return out.Choices[0].Message, nil
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
