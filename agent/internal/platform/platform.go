// Package platform provides an OS abstraction layer for platform-specific
// functionality that cannot be handled by gopsutil alone.
// Each supported OS implements the Platform interface.
package platform

// Platform provides OS-specific functionality beyond what gopsutil offers.
type Platform interface {
	// GetLastShutdownTime returns the last shutdown time as a Unix timestamp.
	GetLastShutdownTime() (int64, error)

	// GetGPUTemperature returns GPU temperature if available.
	// Returns nil if GPU temperature cannot be determined.
	GetGPUTemperature() (*float64, error)

	// Name returns the platform name (windows, linux, darwin, stub).
	Name() string
}
