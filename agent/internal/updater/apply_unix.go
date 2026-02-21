//go:build !windows

package updater

import (
	"fmt"
	"os"
	"os/exec"

	"go.uber.org/zap"
)

func (u *Updater) applyUpdate(newBinaryPath, currentBinaryPath string) error {
	// Make the new binary executable.
	if err := os.Chmod(newBinaryPath, 0755); err != nil {
		return fmt.Errorf("chmod new binary: %w", err)
	}

	// Rename current binary to .old (for rollback).
	oldPath := currentBinaryPath + ".old"
	if err := os.Rename(currentBinaryPath, oldPath); err != nil {
		return fmt.Errorf("backup current binary: %w", err)
	}

	// Move new binary into place.
	if err := os.Rename(newBinaryPath, currentBinaryPath); err != nil {
		// Rollback: restore old binary.
		u.logger.Error("failed to place new binary, rolling back", zap.Error(err))
		if rbErr := os.Rename(oldPath, currentBinaryPath); rbErr != nil {
			u.logger.Error("rollback also failed", zap.Error(rbErr))
		}
		return fmt.Errorf("place new binary: %w", err)
	}

	// Restart the service.
	if err := u.restartService(); err != nil {
		// Rollback: restore old binary.
		u.logger.Error("failed to restart service, rolling back", zap.Error(err))
		_ = os.Remove(currentBinaryPath)
		if rbErr := os.Rename(oldPath, currentBinaryPath); rbErr != nil {
			u.logger.Error("rollback also failed", zap.Error(rbErr))
		}
		return fmt.Errorf("restart service: %w", err)
	}

	return nil
}

func (u *Updater) restartService() error {
	// Try systemctl first (Linux).
	if _, err := exec.LookPath("systemctl"); err == nil {
		u.logger.Info("restarting via systemctl")
		// Try system service first, then user service.
		cmd := exec.Command("systemctl", "restart", "vitalis-agent")
		if err := cmd.Run(); err != nil {
			u.logger.Debug("system service restart failed, trying user service", zap.Error(err))
			cmd = exec.Command("systemctl", "--user", "restart", "vitalis-agent")
			if err := cmd.Run(); err != nil {
				return fmt.Errorf("systemctl restart failed: %w", err)
			}
		}
		return nil
	}

	// Try launchctl (macOS).
	if _, err := exec.LookPath("launchctl"); err == nil {
		u.logger.Info("restarting via launchctl")
		// Try system daemon first.
		cmd := exec.Command("launchctl", "kickstart", "-k", "system/com.vitalis.agent")
		if err := cmd.Run(); err != nil {
			u.logger.Debug("system daemon restart failed, trying user agent", zap.Error(err))
			// For user agent, use gui/<uid>/.
			cmd = exec.Command("launchctl", "kickstart", "-k", fmt.Sprintf("gui/%d/com.vitalis.agent", os.Getuid()))
			if err := cmd.Run(); err != nil {
				return fmt.Errorf("launchctl restart failed: %w", err)
			}
		}
		return nil
	}

	return fmt.Errorf("no supported service manager found")
}
