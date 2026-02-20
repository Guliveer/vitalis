//go:build windows

package autostart

import (
	"fmt"
	"os/exec"
	"time"

	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"
)

const (
	serviceName    = "VitalisAgent"
	serviceDisplay = "Vitalis Monitoring Agent"
	serviceDesc    = "Vitalis system monitoring agent - collects and reports system metrics"
)

type windowsManager struct {
	mode Mode
}

func New() Manager { return NewWithMode(SystemMode) }

func NewWithMode(mode Mode) Manager {
	return &windowsManager{mode: mode}
}

func (w *windowsManager) ServiceName() string { return serviceName }

func (w *windowsManager) IsInstalled() (bool, error) {
	if w.mode == UserMode {
		return w.isInstalledUser()
	}
	return w.isInstalledSystem()
}

func (w *windowsManager) isInstalledSystem() (bool, error) {
	m, err := mgr.Connect()
	if err != nil {
		return false, fmt.Errorf("connecting to SCM: %w", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(serviceName)
	if err != nil {
		return false, nil
	}
	s.Close()
	return true, nil
}

func (w *windowsManager) isInstalledUser() (bool, error) {
	err := exec.Command("schtasks", "/query", "/tn", serviceName).Run()
	if err != nil {
		return false, nil
	}
	return true, nil
}

func (w *windowsManager) Install(execPath string) error {
	if w.mode == UserMode {
		return w.installUser(execPath)
	}
	return w.installSystem(execPath)
}

func (w *windowsManager) installSystem(execPath string) error {
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

func (w *windowsManager) installUser(execPath string) error {
	err := exec.Command(
		"schtasks", "/create",
		"/tn", serviceName,
		"/tr", execPath,
		"/sc", "onlogon",
		"/rl", "limited",
		"/f",
	).Run()
	if err != nil {
		return fmt.Errorf("creating scheduled task: %w", err)
	}
	return nil
}

func (w *windowsManager) Uninstall() error {
	if w.mode == UserMode {
		return w.uninstallUser()
	}
	return w.uninstallSystem()
}

func (w *windowsManager) uninstallSystem() error {
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

	_, _ = s.Control(svc.Stop)
	time.Sleep(2 * time.Second)

	if err := s.Delete(); err != nil {
		return fmt.Errorf("deleting service: %w", err)
	}
	return nil
}

func (w *windowsManager) uninstallUser() error {
	err := exec.Command("schtasks", "/delete", "/tn", serviceName, "/f").Run()
	if err != nil {
		return fmt.Errorf("deleting scheduled task: %w", err)
	}
	return nil
}
