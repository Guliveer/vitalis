//go:build windows

// Package service provides Windows Service integration.
// When running as a Windows service, the agent enters the SCM control loop.
// When running from a terminal, it runs in foreground (debug mode).
package service

import (
	"context"
	"fmt"
	"time"

	"golang.org/x/sys/windows/svc"
	"go.uber.org/zap"
)

const serviceName = "VitalisAgent"

// AgentService implements the Windows service interface (svc.Handler).
type AgentService struct {
	logger  *zap.Logger
	startFn func(ctx context.Context)
}

// New creates a new Windows service wrapper.
// The startFn is called with a cancellable context when the service starts.
func New(logger *zap.Logger, startFn func(ctx context.Context)) *AgentService {
	return &AgentService{
		logger:  logger,
		startFn: startFn,
	}
}

// IsWindowsService checks if the process is running as a Windows service.
func IsWindowsService() bool {
	isService, err := svc.IsWindowsService()
	if err != nil {
		return false
	}
	return isService
}

// Run starts the Windows service control loop.
func (s *AgentService) Run() error {
	return svc.Run(serviceName, s)
}

// Execute implements the svc.Handler interface for Windows SCM integration.
// It manages the service lifecycle: start, running, stop/shutdown.
func (s *AgentService) Execute(args []string, r <-chan svc.ChangeRequest, changes chan<- svc.Status) (ssec bool, errno uint32) {
	changes <- svc.Status{State: svc.StartPending}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start the agent in a goroutine
	go s.startFn(ctx)

	changes <- svc.Status{
		State:   svc.Running,
		Accepts: svc.AcceptStop | svc.AcceptShutdown,
	}
	s.logger.Info("Windows service started")

	for {
		c := <-r
		switch c.Cmd {
		case svc.Interrogate:
			changes <- c.CurrentStatus
		case svc.Stop, svc.Shutdown:
			s.logger.Info("Windows service stopping")
			changes <- svc.Status{State: svc.StopPending}
			cancel()
			// Give goroutines time to flush remaining data
			time.Sleep(5 * time.Second)
			return false, 0
		default:
			s.logger.Warn("Unexpected service control request",
				zap.Uint32("cmd", uint32(c.Cmd)))
		}
	}
}

// Install provides instructions for installing the service.
// In production, use golang.org/x/sys/windows/svc/mgr for programmatic installation.
func Install(exePath string) error {
	return fmt.Errorf("use 'sc create %s binPath= \"%s\"' to install", serviceName, exePath)
}
