//go:build darwin

package autostart

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const serviceLabel = "com.vitalis.agent"

const systemPlistTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.vitalis.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>{execPath}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/var/log/vitalis-agent.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/vitalis-agent.stderr.log</string>
</dict>
</plist>
`

const userPlistTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.vitalis.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>{execPath}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>{dataDir}/vitalis-agent.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>{dataDir}/vitalis-agent.stderr.log</string>
</dict>
</plist>
`

type darwinManager struct {
	mode      Mode
	plistPath string
}

func New() Manager { return NewWithMode(SystemMode) }

func NewWithMode(mode Mode) Manager {
	m := &darwinManager{mode: mode}
	if mode == UserMode {
		home, _ := os.UserHomeDir()
		m.plistPath = filepath.Join(home, "Library", "LaunchAgents", "com.vitalis.agent.plist")
	} else {
		m.plistPath = "/Library/LaunchDaemons/com.vitalis.agent.plist"
	}
	return m
}

func (d *darwinManager) ServiceName() string { return serviceLabel }

func (d *darwinManager) IsInstalled() (bool, error) {
	_, err := os.Stat(d.plistPath)
	if os.IsNotExist(err) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("checking plist file: %w", err)
	}
	return true, nil
}

func (d *darwinManager) Install(execPath string) error {
	if d.mode == UserMode {
		return d.installUser(execPath)
	}
	return d.installSystem(execPath)
}

func (d *darwinManager) installSystem(execPath string) error {
	plist := strings.ReplaceAll(systemPlistTemplate, "{execPath}", execPath)
	if err := os.WriteFile(d.plistPath, []byte(plist), 0644); err != nil {
		return fmt.Errorf("creating plist: %w", err)
	}
	if err := exec.Command("launchctl", "load", "-w", d.plistPath).Run(); err != nil {
		return fmt.Errorf("loading plist: %w", err)
	}
	return nil
}

func (d *darwinManager) installUser(execPath string) error {
	home, _ := os.UserHomeDir()
	dataDir := filepath.Join(home, ".vitalis", "data")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return fmt.Errorf("creating data directory: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(d.plistPath), 0755); err != nil {
		return fmt.Errorf("creating LaunchAgents directory: %w", err)
	}
	plist := strings.ReplaceAll(userPlistTemplate, "{execPath}", execPath)
	plist = strings.ReplaceAll(plist, "{dataDir}", dataDir)
	if err := os.WriteFile(d.plistPath, []byte(plist), 0644); err != nil {
		return fmt.Errorf("creating plist: %w", err)
	}
	if err := exec.Command("launchctl", "load", "-w", d.plistPath).Run(); err != nil {
		return fmt.Errorf("loading plist: %w", err)
	}
	return nil
}

func (d *darwinManager) Uninstall() error {
	_ = exec.Command("launchctl", "unload", d.plistPath).Run()
	if err := os.Remove(d.plistPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("removing plist: %w", err)
	}
	return nil
}
