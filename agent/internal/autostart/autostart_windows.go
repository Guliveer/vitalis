//go:build windows

package autostart

import (
	"fmt"
	"time"

	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"
)

const (
	serviceName    = "VitalisAgent"
	serviceDisplay = "Vitalis Monitoring Agent"
	serviceDesc    = "Vitalis system monitoring agent - collects and reports system metrics"
)

// windowsManager implements Manager for Windows using the Service Control Manager.
type windowsManager struct{}

// New returns a Manager that uses the Windows Service Control Manager.
func New() Manager {
	return &windowsManager{}
}

// ServiceName returns the Windows service name.
func (w *windowsManager) ServiceName() string { return serviceName }

// IsInstalled checks whether the VitalisAgent service is registered in the SCM.
func (w *windowsManager) IsInstalled() (bool, error) {
	m, err := mgr.Connect()
	if err != nil {
		return false, fmt.Errorf("connecting to SCM: %w", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(serviceName)
	if err != nil {
		// Service does not exist.
		return false, nil
	}
	s.Close()
	return true, nil
}

// Install creates the Windows service and starts it immediately.
func (w *windowsManager) Install(execPath string) error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("connecting to SCM: %w", err)
	}
	defer m.Disconnect()

	s, err := m.CreateService(serviceName, execPath, mgr.Config{
		DisplayName: serviceDisplay,
		Description: serviceDesc,
		StartType:   mgr.StartAutomatic,
	})
	if err != nil {
		return fmt.Errorf("creating service: %w", err)
	}
	defer s.Close()

	if err := s.Start(); err != nil {
		return fmt.Errorf("starting service: %w", err)
	}

	return nil
}

// Uninstall stops and deletes the Windows service.
func (w *windowsManager) Uninstall() error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("connecting to SCM: %w", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(serviceName)
	if err != nil {
		return fmt.Errorf("opening service: %w", err)
	}
	defer s.Close()

	// Attempt to stop the service; ignore errors if it is already stopped.
	_, _ = s.Control(svc.Stop)
	// Give the service a moment to stop before deleting.
	time.Sleep(2 * time.Second)

	if err := s.Delete(); err != nil {
		return fmt.Errorf("deleting service: %w", err)
	}
	return nil
}
