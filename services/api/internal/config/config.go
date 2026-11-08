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
}

// Load lee el .env de la raíz del repo si existe y valida lo indispensable.
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
		WebOrigin:    env("WEB_ORIGIN", "http://localhost:3000"),
		SessionKey:   os.Getenv("SESSION_SECRET"),
		ResendAPIKey: os.Getenv("RESEND_API_KEY"),
		EmailFrom:    env("EMAIL_FROM", "no-reply@kilora.com"),
		Env:          env("APP_ENV", "development"),
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
