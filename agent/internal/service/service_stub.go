//go:build !windows

// Package service provides a stub implementation for non-Windows platforms.
// On macOS and Linux the agent runs as a foreground process; the Windows
// service wrapper is not needed.
package service

import (
	"context"

	"go.uber.org/zap"
)

// AgentService is a no-op service wrapper for non-Windows platforms.
type AgentService struct {
	logger  *zap.Logger
	startFn func(ctx context.Context)
}

// New creates a stub service wrapper for non-Windows platforms.
func New(logger *zap.Logger, startFn func(ctx context.Context)) *AgentService {
	return &AgentService{
		logger:  logger,
		startFn: startFn,
	}
}

// IsWindowsService always returns false on non-Windows platforms.
func IsWindowsService() bool {
	return false
}

// Run executes the agent directly (no service wrapper needed on non-Windows).
func (s *AgentService) Run() error {
	ctx := context.Background()
	s.startFn(ctx)
	return nil
}
