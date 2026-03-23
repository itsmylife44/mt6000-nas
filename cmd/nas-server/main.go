package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/itsmylife44/mt6000-nas/internal/api"
	"github.com/itsmylife44/mt6000-nas/internal/config"
)

func main() {
	configPath := flag.String("config", "/etc/nas-dashboard/config.json", "path to config.json")
	portOverride := flag.Int("port", 0, "override listen port (0 = use config value)")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	if *portOverride != 0 {
		cfg.Port = *portOverride
	}

	if cfg.SessionSecret == "" {
		secret, genErr := generateSessionSecret()
		if genErr != nil {
			log.Fatalf("failed to generate session secret: %v", genErr)
		}
		cfg.SessionSecret = secret
		if saveErr := cfg.Save(*configPath); saveErr != nil {
			log.Fatalf("failed to save config with session secret: %v", saveErr)
		}
		log.Println("generated new session secret and saved to config")
	}

	router := api.NewRouter(cfg)

	addr := fmt.Sprintf("%s:%d", cfg.ListenAddr, cfg.Port)
	srv := &http.Server{
		Addr:         addr,
		Handler:      router,
		ReadTimeout:  5 * time.Minute,
		WriteTimeout: 10 * time.Minute,
		IdleTimeout:  2 * time.Minute,
	}

	log.Printf("nas-dashboard starting on http://%s", addr)
	log.Printf("storage path: %s", cfg.StoragePath)

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		if listenErr := srv.ListenAndServe(); listenErr != nil && listenErr != http.ErrServerClosed {
			log.Fatalf("server error: %v", listenErr)
		}
	}()

	<-sigCh
	log.Println("shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("graceful shutdown error: %v", err)
		os.Exit(1)
	}

	log.Println("shutdown complete")
}

func generateSessionSecret() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
