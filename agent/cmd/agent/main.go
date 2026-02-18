// Package main is the entry point for the Vitalis monitoring agent.
// It initializes configuration, sets up collectors, starts the scheduler,
// and runs as either a Windows service or a standalone foreground process.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	"github.com/vitalis-app/agent/internal/autostart"
	"github.com/vitalis-app/agent/internal/buffer"
	"github.com/vitalis-app/agent/internal/collector"
	"github.com/vitalis-app/agent/internal/config"
	"github.com/vitalis-app/agent/internal/models"
	"github.com/vitalis-app/agent/internal/scheduler"
	"github.com/vitalis-app/agent/internal/sender"
	"github.com/vitalis-app/agent/internal/service"
)

var (
	// version is set at build time via -ldflags.
	version = "dev"

	showVersion = flag.Bool("version", false, "Show version and exit")
	install     = flag.Bool("install", false, "Install autostart entry and exit")
	uninstall   = flag.Bool("uninstall", false, "Remove autostart entry and exit")
)

func main() {
	flag.Parse()

	if *showVersion {
		fmt.Printf("vitalis-agent %s\n", version)
		os.Exit(0)
	}

	// Handle --install: register as a system service and exit.
	if *install {
		mgr := autostart.New()
		execPath, err := os.Executable()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Install failed: cannot determine executable path: %v\n", err)
			os.Exit(1)
		}
		if err := mgr.Install(execPath); err != nil {
			fmt.Fprintf(os.Stderr, "Install failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Installed as system service (%s).\n", mgr.ServiceName())
		os.Exit(0)
	}

	// Handle --uninstall: remove the system service and exit.
	if *uninstall {
		mgr := autostart.New()
		if err := mgr.Uninstall(); err != nil {
			fmt.Fprintf(os.Stderr, "Uninstall failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Uninstalled system service (%s).\n", mgr.ServiceName())
		os.Exit(0)
	}

	// Load embedded configuration
	cfg, err := config.LoadFromBytes(embeddedConfig)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to load config: %v\n", err)
		os.Exit(1)
	}

	// Initialize logger
	logger := initLogger(cfg)
	defer logger.Sync()

	logger.Info("Starting Vitalis Agent",
		zap.String("version", version),
		zap.String("server", cfg.Server.URL))

	// Validate configuration (includes URL, token, and HTTPS enforcement)
	if err := cfg.Validate(); err != nil {
		logger.Fatal("Invalid configuration", zap.Error(err))
	}

	// Auto-install as system service on first run.
	// Failures are logged but do not prevent the agent from running.
	mgr := autostart.New()
	installed, err := mgr.IsInstalled()
	if err != nil {
		logger.Warn("Could not check autostart status", zap.Error(err))
	}
	if !installed {
		execPath, err := os.Executable()
		if err != nil {
			logger.Warn("Auto-install skipped: cannot determine executable path",
				zap.Error(err))
		} else if err := mgr.Install(execPath); err != nil {
			logger.Warn("Auto-install failed (may need elevated privileges)",
				zap.Error(err))
		} else {
			logger.Info("Auto-installed as system service",
				zap.String("service", mgr.ServiceName()))
		}
	} else {
		logger.Debug("Service already registered",
			zap.String("service", mgr.ServiceName()))
	}

	// Check if running as Windows service
	if service.IsWindowsService() {
		logger.Info("Running as Windows service")
		svc := service.New(logger, func(ctx context.Context) {
			runAgent(ctx, cfg, logger)
		})
		if err := svc.Run(); err != nil {
			logger.Fatal("Service failed", zap.Error(err))
		}
		return
	}

	// Running as standalone foreground process
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle OS signals for graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		sig := <-sigCh
		logger.Info("Received signal, shutting down",
			zap.String("signal", sig.String()))
		cancel()
	}()

	runAgent(ctx, cfg, logger)
	logger.Info("Agent stopped")
}

// runAgent initializes all components and starts the collection/send loop.
// It blocks until the context is cancelled.
func runAgent(ctx context.Context, cfg *config.Config, logger *zap.Logger) {
	// Initialize file-based buffer
	buf, err := buffer.New(cfg.Buffer.DBPath, cfg.Buffer.MaxSizeMB, logger)
	if err != nil {
		logger.Fatal("Failed to initialize buffer", zap.Error(err))
	}

	// Initialize HTTP sender
	snd := sender.New(cfg, logger, buf)

	// Flush any buffered metrics from previous runs
	snd.FlushBuffer()

	// Initialize collector registry and register all collectors
	registry := collector.NewRegistry(logger)
	registry.Register(collector.NewCPUCollector())
	registry.Register(collector.NewMemoryCollector())
	registry.Register(collector.NewDiskCollector())
	registry.Register(collector.NewNetworkCollector())
	registry.Register(collector.NewProcessCollector(cfg.Collection.TopProcesses))
	registry.Register(collector.NewUptimeCollector())
	registry.Register(collector.NewTemperatureCollector())
	registry.Register(collector.NewShutdownCollector())

	// Initialize scheduler with batch-ready callback
	sched := scheduler.New(registry, cfg, logger)
	sched.OnBatchReady(func(batch []models.MetricSnapshot) {
		snd.Send(batch)
	})

	// Start the scheduler (blocks until context is cancelled)
	logger.Info("Agent running",
		zap.Duration("collect_interval", cfg.Collection.Interval.Duration),
		zap.Duration("batch_interval", cfg.Collection.BatchInterval.Duration))
	sched.Start(ctx)
}

// initLogger creates a zap logger based on the configuration.
// It outputs to both console (human-readable) and optionally a JSON log file.
func initLogger(cfg *config.Config) *zap.Logger {
	var level zapcore.Level
	switch cfg.Logging.Level {
	case "debug":
		level = zapcore.DebugLevel
	case "warn":
		level = zapcore.WarnLevel
	case "error":
		level = zapcore.ErrorLevel
	default:
		level = zapcore.InfoLevel
	}

	encoderConfig := zap.NewProductionEncoderConfig()
	encoderConfig.TimeKey = "time"
	encoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder

	// Console output (human-readable)
	consoleCore := zapcore.NewCore(
		zapcore.NewConsoleEncoder(encoderConfig),
		zapcore.AddSync(os.Stdout),
		level,
	)

	cores := []zapcore.Core{consoleCore}

	// File output (structured JSON, if configured)
	if cfg.Logging.File != "" {
		file, err := os.OpenFile(cfg.Logging.File, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0640)
		if err == nil {
			fileCore := zapcore.NewCore(
				zapcore.NewJSONEncoder(encoderConfig),
				zapcore.AddSync(file),
				level,
			)
			cores = append(cores, fileCore)
		}
	}

	return zap.New(zapcore.NewTee(cores...))
}
