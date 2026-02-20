//go:build linux || darwin

package setup

import (
	"fmt"
	"os"
)

// CheckElevation verifies the process has root privileges when needed.
// Returns nil if mode is ModeUser or if running as root.
func CheckElevation(mode InstallMode) error {
	if mode == ModeUser {
		return nil
	}
	if os.Geteuid() != 0 {
		return fmt.Errorf("system-wide installation requires root privileges\n\nRun with sudo:\n  sudo %s --setup", os.Args[0])
	}
	return nil
}
