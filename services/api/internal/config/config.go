// Package config carga la configuración del API desde el entorno.
package config

import (
	"fmt"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Addr         string
	DatabaseURL  string
	WebOrigin    string
	SessionKey   string
	ResendAPIKey string
	EmailFrom    string
	Env          string
	DemoMode     bool
	OpenAI       OpenAIConfig
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

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL no está definida")
	}
	if cfg.IsProduction() && cfg.SessionKey == "" {
		return Config{}, fmt.Errorf("SESSION_SECRET es obligatoria en producción")
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
