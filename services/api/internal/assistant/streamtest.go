package assistant

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// StreamTestMessage escribe msg como lo haría OpenAI en streaming (SSE),
// partiendo el texto y los argumentos en varios fragmentos. Solo para pruebas.
func StreamTestMessage(w http.ResponseWriter, msg Message) {
	w.Header().Set("Content-Type", "text/event-stream")
	write := func(delta map[string]any) {
		data, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"index": 0, "delta": delta}}})
		fmt.Fprintf(w, "data: %s\n\n", data)
	}
	if msg.Content != nil {
		text := []rune(*msg.Content)
		half := len(text) / 2
		write(map[string]any{"role": "assistant", "content": string(text[:half])})
		write(map[string]any{"content": string(text[half:])})
	}
	for i, call := range msg.ToolCalls {
		args := call.Function.Arguments
		half := len(args) / 2
		write(map[string]any{"tool_calls": []any{map[string]any{"index": i, "id": call.ID, "type": "function", "function": map[string]any{"name": call.Function.Name, "arguments": args[:half]}}}})
		write(map[string]any{"tool_calls": []any{map[string]any{"index": i, "function": map[string]any{"arguments": args[half:]}}}})
	}
	fmt.Fprint(w, "data: [DONE]\n\n")
}
