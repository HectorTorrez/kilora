package config

import (
	"strings"
	"testing"
)

func productionEnv(t *testing.T) {
	t.Helper()
	for key, value := range map[string]string{
		"DATABASE_URL": "postgres://test", "APP_ENV": "production",
		"SESSION_SECRET": strings.Repeat("s", 48), "RESEND_API_KEY": "test-key",
		"EMAIL_FROM": "Kilora <no-reply@kilora.app>", "WEB_ORIGIN": "https://kilora.app",
		"DEMO_MODE": "false", "TRUSTED_PROXY_CIDRS": "",
	} {
		t.Setenv(key, value)
	}
}

func TestProductionConfig(t *testing.T) {
	productionEnv(t)
	cfg, err := Load()
	if err != nil || !cfg.IsProduction() {
		t.Fatalf("production config: %v", err)
	}
}

func TestRejectUnsafeProductionConfig(t *testing.T) {
	for _, tc := range []struct{ key, value string }{
		{"DATABASE_URL", ""}, {"SESSION_SECRET", ""}, {"SESSION_SECRET", "short"},
		{"RESEND_API_KEY", ""}, {"EMAIL_FROM", "invalid"}, {"WEB_ORIGIN", "http://kilora.app"},
		{"WEB_ORIGIN", "https://kilora.app/path"}, {"WEB_ORIGIN", "https://user@kilora.app"},
		{"WEB_ORIGIN", "https://kilora.app?query=1"}, {"WEB_ORIGIN", "https://kilora.app#fragment"},
		{"APP_ENV", "prod"}, {"TRUSTED_PROXY_CIDRS", "anywhere"},
	} {
		t.Run(tc.key+"="+tc.value, func(t *testing.T) {
			productionEnv(t)
			t.Setenv(tc.key, tc.value)
			if _, err := Load(); err == nil {
				t.Fatal("unsafe configuration accepted")
			}
		})
	}
}

func TestProductionDemoConfig(t *testing.T) {
	productionEnv(t)
	t.Setenv("DEMO_MODE", "true")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.IsProduction() || !cfg.DemoMode {
		t.Fatal("production demo configuration was not preserved")
	}
}

func TestDevelopmentWithoutEmail(t *testing.T) {
	productionEnv(t)
	t.Setenv("APP_ENV", "development")
	t.Setenv("RESEND_API_KEY", "")
	t.Setenv("SESSION_SECRET", "")
	t.Setenv("WEB_ORIGIN", "http://localhost:3300")
	t.Setenv("DEMO_MODE", "true")
	if _, err := Load(); err != nil {
		t.Fatal(err)
	}
}

func TestTrustedProxyConfig(t *testing.T) {
	productionEnv(t)
	t.Setenv("TRUSTED_PROXY_CIDRS", "10.0.0.0/24, 2001:db8::/32")
	cfg, err := Load()
	if err != nil || len(cfg.TrustedProxies) != 2 {
		t.Fatalf("proxy config: %v", err)
	}
}
