//go:build linux

package autostart

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const serviceName = "vitalis-agent"

const systemUnitTemplate = `[Unit]
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

const userUnitTemplate = `[Unit]
Description=Vitalis Monitoring Agent
After=default.target

[Service]
Type=simple
ExecStart={execPath}
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
`

type linuxManager struct {
	mode     Mode
	unitPath string
}

func New() Manager { return NewWithMode(SystemMode) }

func NewWithMode(mode Mode) Manager {
	m := &linuxManager{mode: mode}
	if mode == UserMode {
		home, _ := os.UserHomeDir()
		m.unitPath = filepath.Join(home, ".config", "systemd", "user", "vitalis-agent.service")
	} else {
		m.unitPath = "/etc/systemd/system/vitalis-agent.service"
	}
	return m
}

func (l *linuxManager) ServiceName() string { return serviceName }

func (l *linuxManager) IsInstalled() (bool, error) {
	_, err := os.Stat(l.unitPath)
	if os.IsNotExist(err) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("checking unit file: %w", err)
	}
	return true, nil
}

func (l *linuxManager) Install(execPath string) error {
	if l.mode == UserMode {
		return l.installUser(execPath)
	}
	return l.installSystem(execPath)
}

func (l *linuxManager) installSystem(execPath string) error {
	if err := os.MkdirAll("/var/lib/vitalis", 0755); err != nil {
		return fmt.Errorf("creating data directory: %w", err)
	}
	unit := strings.ReplaceAll(systemUnitTemplate, "{execPath}", execPath)
	if err := os.WriteFile(l.unitPath, []byte(unit), 0644); err != nil {
		return fmt.Errorf("writing unit file: %w", err)
	}
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

func (l *linuxManager) installUser(execPath string) error {
	if err := os.MkdirAll(filepath.Dir(l.unitPath), 0755); err != nil {
		return fmt.Errorf("creating systemd user directory: %w", err)
	}
	unit := strings.ReplaceAll(userUnitTemplate, "{execPath}", execPath)
	if err := os.WriteFile(l.unitPath, []byte(unit), 0644); err != nil {
		return fmt.Errorf("writing unit file: %w", err)
	}
	commands := [][]string{
		{"systemctl", "--user", "daemon-reload"},
		{"systemctl", "--user", "enable", serviceName},
		{"systemctl", "--user", "start", serviceName},
	}
	for _, args := range commands {
		if err := exec.Command(args[0], args[1:]...).Run(); err != nil {
			return fmt.Errorf("running %s: %w", strings.Join(args, " "), err)
		}
	}
	return nil
}

func (l *linuxManager) Uninstall() error {
	if l.mode == UserMode {
		_ = exec.Command("systemctl", "--user", "stop", serviceName).Run()
		_ = exec.Command("systemctl", "--user", "disable", serviceName).Run()
	} else {
		_ = exec.Command("systemctl", "stop", serviceName).Run()
		_ = exec.Command("systemctl", "disable", serviceName).Run()
	}
	if err := os.Remove(l.unitPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("removing unit file: %w", err)
	}
	if l.mode == UserMode {
		_ = exec.Command("systemctl", "--user", "daemon-reload").Run()
	} else {
		_ = exec.Command("systemctl", "daemon-reload").Run()
	}
	return nil
}
