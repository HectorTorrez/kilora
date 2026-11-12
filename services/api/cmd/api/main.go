package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"kilora/api/internal/assistant"
	"kilora/api/internal/auth"
	"kilora/api/internal/config"
	"kilora/api/internal/database"
	"kilora/api/internal/httpserver"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	if err := run(logger); err != nil {
		logger.Error("el API terminó con error", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	var mailer auth.Mailer = auth.LogMailer{Logger: logger}
	if cfg.ResendAPIKey != "" {
		mailer = auth.ResendMailer{APIKey: cfg.ResendAPIKey, From: cfg.EmailFrom}
	}
	var ai *assistant.OpenAI
	if cfg.OpenAI.APIKey != "" {
		ai = &assistant.OpenAI{APIKey: cfg.OpenAI.APIKey, BaseURL: cfg.OpenAI.BaseURL, Model: cfg.OpenAI.Model, EmbeddingModel: cfg.OpenAI.EmbeddingModel, ReasoningEffort: cfg.OpenAI.ReasoningEffort}
	} else {
		logger.Info("asistente de IA desactivado: falta OPENAI_API_KEY")
	}
	srv := &http.Server{
		Addr: cfg.Addr,
		Handler: httpserver.NewRouter(httpserver.Deps{
			Logger:        logger,
			DB:            pool,
			WebOrigin:     cfg.WebOrigin,
			Mailer:        mailer,
			SecureCookies: cfg.IsProduction(),
			DemoMode:      cfg.DemoMode,
			AI:            ai,
		}),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("API escuchando", "addr", cfg.Addr, "env", cfg.Env)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	}

	logger.Info("apagando el API")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}
