//go:build !windows

// Stub Platform implementation for non-Windows builds.
// Returns safe defaults for all methods — used during development on macOS/Linux.
// Future: Replace with actual macOS/Linux implementations.
package platform

// StubPlatform is a no-op Platform for non-Windows operating systems.
type StubPlatform struct{}

// New creates a stub platform instance for non-Windows systems.
func New() Platform {
	return &StubPlatform{}
}

// Name returns the platform identifier.
func (p *StubPlatform) Name() string { return "stub" }

// GetLastShutdownTime returns 0 on non-Windows platforms.
func (p *StubPlatform) GetLastShutdownTime() (int64, error) {
	return 0, nil
}

// GetGPUTemperature returns nil on non-Windows platforms.
func (p *StubPlatform) GetGPUTemperature() (*float64, error) {
	return nil, nil
}
