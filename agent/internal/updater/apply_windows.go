//go:build windows

package updater

import (
	"fmt"
	"os"
	"os/exec"
	"time"

	"go.uber.org/zap"
)

func (u *Updater) applyUpdate(newBinaryPath, currentBinaryPath string) error {
	// On Windows, we can rename a running executable but not delete/overwrite it.
	oldPath := currentBinaryPath + ".old"

	// Remove any previous .old file.
	os.Remove(oldPath)

	// Rename current binary to .old.
	if err := os.Rename(currentBinaryPath, oldPath); err != nil {
		return fmt.Errorf("backup current binary: %w", err)
	}

	// Move new binary into place.
	if err := os.Rename(newBinaryPath, currentBinaryPath); err != nil {
		// Rollback.
		u.logger.Error("failed to place new binary, rolling back", zap.Error(err))
		if rbErr := os.Rename(oldPath, currentBinaryPath); rbErr != nil {
			u.logger.Error("rollback also failed", zap.Error(rbErr))
		}
		return fmt.Errorf("place new binary: %w", err)
	}

	// Restart the service.
	if err := u.restartService(); err != nil {
		u.logger.Error("failed to restart service, rolling back", zap.Error(err))
		os.Remove(currentBinaryPath)
		_ = os.Rename(oldPath, currentBinaryPath)
		return fmt.Errorf("restart service: %w", err)
	}

	return nil
}

func (u *Updater) restartService() error {
	serviceName := "VitalisAgent"

	u.logger.Info("restarting Windows service", zap.String("service", serviceName))

	// Stop the service.
	stopCmd := exec.Command("sc", "stop", serviceName)
	if err := stopCmd.Run(); err != nil {
		u.logger.Debug("sc stop failed, trying net stop", zap.Error(err))
		stopCmd = exec.Command("net", "stop", serviceName)
		if err := stopCmd.Run(); err != nil {
			// Service might not be running as SCM service (could be user-mode scheduled task).
			u.logger.Debug("net stop also failed, trying schtasks", zap.Error(err))
			return u.restartScheduledTask()
		}
	}

	// Wait a moment for the service to stop.
	time.Sleep(2 * time.Second)

	// Start the service.
	startCmd := exec.Command("sc", "start", serviceName)
	if err := startCmd.Run(); err != nil {
		startCmd = exec.Command("net", "start", serviceName)
		if err := startCmd.Run(); err != nil {
			return fmt.Errorf("failed to start service: %w", err)
		}
	}

	return nil
}

func (u *Updater) restartScheduledTask() error {
	taskName := "VitalisAgent"

	// End the running task.
	endCmd := exec.Command("schtasks", "/End", "/TN", taskName)
	if err := endCmd.Run(); err != nil {
		return fmt.Errorf("failed to end scheduled task: %w", err)
	}

	time.Sleep(2 * time.Second)

	// Run the task again.
	runCmd := exec.Command("schtasks", "/Run", "/TN", taskName)
	if err := runCmd.Run(); err != nil {
		return fmt.Errorf("failed to run scheduled task: %w", err)
	}

	return nil
}
