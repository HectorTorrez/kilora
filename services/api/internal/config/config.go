// Package config carga la configuración del API desde el entorno.
package config

import (
	"fmt"
	"net/mail"
	"net/netip"
	"net/url"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Addr           string
	DatabaseURL    string
	WebOrigin      string
	SessionKey     string
	ResendAPIKey   string
	EmailFrom      string
	Env            string
	DemoMode       bool
	TrustedProxies []netip.Prefix
	OpenAI         OpenAIConfig
}

// OpenAIConfig configura el asistente de IA; sin APIKey el asistente queda desactivado.
type OpenAIConfig struct {
	APIKey          string
	BaseURL         string
	Model           string
	EmbeddingModel  string
	ReasoningEffort string
}

func Load() (Config, error) {
	// El proceso puede arrancar desde la raíz del repo o desde services/api.
	for _, file := range []string{"../../.env", ".env"} {
		if _, err := os.Stat(file); err == nil {
			_ = godotenv.Load(file)
		}
	}

	cfg := Config{
		Addr:         env("API_ADDR", ":8080"),
		DatabaseURL:  os.Getenv("DATABASE_URL"),
		WebOrigin:    env("WEB_ORIGIN", "http://localhost:3300"),
		SessionKey:   os.Getenv("SESSION_SECRET"),
		ResendAPIKey: os.Getenv("RESEND_API_KEY"),
		EmailFrom:    env("EMAIL_FROM", "no-reply@kilora.com"),
		Env:          env("APP_ENV", "development"),
		DemoMode:     strings.EqualFold(os.Getenv("DEMO_MODE"), "true"),
		OpenAI: OpenAIConfig{
			APIKey:          os.Getenv("OPENAI_API_KEY"),
			BaseURL:         env("OPENAI_BASE_URL", "https://api.openai.com/v1"),
			Model:           env("OPENAI_MODEL", "gpt-5-mini"),
			EmbeddingModel:  env("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
			ReasoningEffort: envOr("OPENAI_REASONING_EFFORT", "low"),
		},
	}

	for _, cidr := range strings.Split(os.Getenv("TRUSTED_PROXY_CIDRS"), ",") {
		if strings.TrimSpace(cidr) == "" {
			continue
		}
		prefix, err := netip.ParsePrefix(strings.TrimSpace(cidr))
		if err != nil {
			return Config{}, fmt.Errorf("TRUSTED_PROXY_CIDRS inválido: %w", err)
		}
		cfg.TrustedProxies = append(cfg.TrustedProxies, prefix)
	}

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL no está definida")
	}
	if !strings.EqualFold(cfg.Env, "development") && !cfg.IsProduction() {
		return Config{}, fmt.Errorf("APP_ENV debe ser development o production")
	}
	if cfg.IsProduction() {
		if len(cfg.SessionKey) < 32 {
			return Config{}, fmt.Errorf("SESSION_SECRET debe tener al menos 32 caracteres en producción")
		}
		if cfg.ResendAPIKey == "" {
			return Config{}, fmt.Errorf("RESEND_API_KEY es obligatoria en producción")
		}
		if _, err := mail.ParseAddress(cfg.EmailFrom); err != nil {
			return Config{}, fmt.Errorf("EMAIL_FROM inválido: %w", err)
		}
		origin, err := url.Parse(cfg.WebOrigin)
		if err != nil || origin.Scheme != "https" || origin.Hostname() == "" || origin.User != nil || origin.RawQuery != "" || origin.Fragment != "" || origin.Path != "" {
			return Config{}, fmt.Errorf("WEB_ORIGIN debe ser un origen HTTPS sin ruta en producción")
		}
	}

	return cfg, nil
}

func (c Config) IsProduction() bool {
	return strings.EqualFold(c.Env, "production")
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// envOr es como env, pero respeta un valor vacío definido explícitamente.
func envOr(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return fallback
}
