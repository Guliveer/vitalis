// Package autostart handles automatic service/daemon installation
// across Windows, Linux, and macOS.
package autostart

// Manager provides platform-specific autostart installation.
type Manager interface {
	// IsInstalled returns true if the agent is already registered
	// as a service/autostart entry.
	IsInstalled() (bool, error)

	// Install registers the agent as a system service/autostart entry.
	// execPath is the absolute path to the current binary.
	Install(execPath string) error

	// Uninstall removes the agent from system services/autostart.
	Uninstall() error

	// ServiceName returns the name used for the service registration.
	ServiceName() string
}
