//go:build darwin

package autostart

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
)

const (
	serviceLabel = "com.vitalis.agent"
	plistPath    = "/Library/LaunchDaemons/com.vitalis.agent.plist"
)

// plistTemplate is the launchd plist written during installation.
// The placeholder {execPath} is replaced with the actual binary path.
const plistTemplate = `<?xml version="1.0" encoding="UTF-8"?>
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

// darwinManager implements Manager for macOS using launchd.
type darwinManager struct{}

// New returns a Manager that uses launchd for service management.
func New() Manager {
	return &darwinManager{}
}

// ServiceName returns the launchd service label.
func (d *darwinManager) ServiceName() string { return serviceLabel }

// IsInstalled checks whether the launchd plist file exists.
func (d *darwinManager) IsInstalled() (bool, error) {
	_, err := os.Stat(plistPath)
	if os.IsNotExist(err) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("checking plist file: %w", err)
	}
	return true, nil
}

// Install writes the launchd plist and loads it.
func (d *darwinManager) Install(execPath string) error {
	// Write the plist file with the binary path substituted.
	plist := strings.ReplaceAll(plistTemplate, "{execPath}", execPath)
	if err := os.WriteFile(plistPath, []byte(plist), 0644); err != nil {
		return fmt.Errorf("creating plist: %w", err)
	}

	if err := exec.Command("launchctl", "load", "-w", plistPath).Run(); err != nil {
		return fmt.Errorf("loading plist: %w", err)
	}

	return nil
}

// Uninstall unloads and removes the launchd plist.
func (d *darwinManager) Uninstall() error {
	// Best-effort unload; ignore errors if the service is not loaded.
	_ = exec.Command("launchctl", "unload", plistPath).Run()

	if err := os.Remove(plistPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("removing plist: %w", err)
	}
	return nil
}
