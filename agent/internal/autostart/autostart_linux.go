//go:build linux

package autostart

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
)

const (
	serviceName = "vitalis-agent"
	unitPath    = "/etc/systemd/system/vitalis-agent.service"
)

// unitTemplate is the systemd unit file written during installation.
// The placeholder {execPath} is replaced with the actual binary path.
const unitTemplate = `[Unit]
Description=Vitalis Monitoring Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart={execPath}
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=vitalis-agent

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/vitalis
PrivateTmp=true

[Install]
WantedBy=multi-user.target
`

// linuxManager implements Manager for Linux using systemd.
type linuxManager struct{}

// New returns a Manager that uses systemd for service management.
func New() Manager {
	return &linuxManager{}
}

// ServiceName returns the systemd service name.
func (l *linuxManager) ServiceName() string { return serviceName }

// IsInstalled checks whether the systemd unit file exists.
func (l *linuxManager) IsInstalled() (bool, error) {
	_, err := os.Stat(unitPath)
	if os.IsNotExist(err) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("checking unit file: %w", err)
	}
	return true, nil
}

// Install writes the systemd unit file, reloads the daemon, enables and starts the service.
func (l *linuxManager) Install(execPath string) error {
	// Ensure data directory exists.
	if err := os.MkdirAll("/var/lib/vitalis", 0755); err != nil {
		return fmt.Errorf("creating data directory: %w", err)
	}

	// Write the unit file with the binary path substituted.
	unit := strings.ReplaceAll(unitTemplate, "{execPath}", execPath)
	if err := os.WriteFile(unitPath, []byte(unit), 0644); err != nil {
		return fmt.Errorf("writing unit file: %w", err)
	}

	// Reload systemd, enable, and start the service.
	commands := [][]string{
		{"systemctl", "daemon-reload"},
		{"systemctl", "enable", serviceName},
		{"systemctl", "start", serviceName},
	}
	for _, args := range commands {
		if err := exec.Command(args[0], args[1:]...).Run(); err != nil {
			return fmt.Errorf("running %s: %w", strings.Join(args, " "), err)
		}
	}

	return nil
}

// Uninstall stops, disables, and removes the systemd service.
func (l *linuxManager) Uninstall() error {
	// Best-effort stop and disable; ignore errors if the service is already inactive.
	_ = exec.Command("systemctl", "stop", serviceName).Run()
	_ = exec.Command("systemctl", "disable", serviceName).Run()

	if err := os.Remove(unitPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("removing unit file: %w", err)
	}

	_ = exec.Command("systemctl", "daemon-reload").Run()
	return nil
}
