package notifications

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

type Config struct {
	APIKey             string
	PhoneNumberID      string
	Language           string
	QuoteTemplate      string
	TrackingTemplate   string
	InvitationTemplate string
}

func (c Config) Template(kind string) string {
	switch kind {
	case "quote":
		return c.QuoteTemplate
	case "tracking":
		return c.TrackingTemplate
	case "invitation":
		return c.InvitationTemplate
	}
	return ""
}
func (c Config) Enabled(kind string) bool {
	return c.APIKey != "" && c.PhoneNumberID != "" && c.Template(kind) != "" && c.Language != ""
}

var phonePattern = regexp.MustCompile(`^[1-9][0-9]{7,14}$`)

func Phone(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	var b strings.Builder
	for i, ch := range raw {
		switch {
		case ch >= '0' && ch <= '9':
			b.WriteRune(ch)
		case ch == '+' && i == 0:
		case ch == ' ' || ch == '-' || ch == '(' || ch == ')':
		default:
			return "", errors.New("invalid phone")
		}
	}
	number := b.String()
	if len(number) == 8 && !strings.HasPrefix(raw, "+") {
		number = "503" + number
	}
	if !phonePattern.MatchString(number) {
		return "", errors.New("invalid phone")
	}
	return number, nil
}

type SendError struct {
	Code      string
	Retry     bool
	Uncertain bool
}

func (e *SendError) Error() string { return "kapso: " + e.Code }

type Sender interface {
	Send(context.Context, string, string, []string) (string, error)
}
type Kapso struct {
	Config  Config
	Client  *http.Client
	BaseURL string
}

func (k *Kapso) Send(ctx context.Context, kind, recipient string, parameters []string) (string, error) {
	if !k.Config.Enabled(kind) {
		return "", &SendError{Code: "not_configured"}
	}
	params := make([]map[string]string, 0, len(parameters))
	for _, value := range parameters {
		params = append(params, map[string]string{"type": "text", "text": value})
	}
	body, err := json.Marshal(map[string]any{
		"messaging_product": "whatsapp", "recipient_type": "individual", "to": recipient, "type": "template",
		"template": map[string]any{"name": k.Config.Template(kind), "language": map[string]string{"code": k.Config.Language}, "components": []any{map[string]any{"type": "body", "parameters": params}}},
	})
	if err != nil {
		return "", err
	}
	base := k.BaseURL
	if base == "" {
		base = "https://api.kapso.ai/meta/whatsapp/v24.0"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(base, "/")+"/"+k.Config.PhoneNumberID+"/messages", bytes.NewReader(body))
	if err != nil {
		return "", &SendError{Code: "invalid_request"}
	}
	req.Header.Set("X-API-Key", k.Config.APIKey)
	req.Header.Set("Content-Type", "application/json")
	client := k.Client
	if client == nil {
		client = &http.Client{Timeout: 20 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	res, err := client.Do(req)
	if err != nil {
		return "", &SendError{Code: "transport_error", Uncertain: true}
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return "", &SendError{Code: fmt.Sprintf("http_%d", res.StatusCode), Retry: res.StatusCode == 429, Uncertain: res.StatusCode >= 500 || res.StatusCode == 408}
	}
	var result struct {
		Messages []struct {
			ID string `json:"id"`
		} `json:"messages"`
	}
	if json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&result) != nil || len(result.Messages) != 1 || result.Messages[0].ID == "" {
		return "", &SendError{Code: "invalid_response", Uncertain: true}
	}
	return result.Messages[0].ID, nil
}
