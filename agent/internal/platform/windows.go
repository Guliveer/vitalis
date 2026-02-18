//go:build windows

// Windows-specific Platform implementation.
// Uses system commands for Windows-specific metrics.
package platform

import (
	"os/exec"
	"strconv"
	"strings"
)

// WindowsPlatform implements Platform for Windows systems.
type WindowsPlatform struct{}

// New creates a new Windows platform instance.
func New() Platform {
	return &WindowsPlatform{}
}

// Name returns the platform identifier.
func (p *WindowsPlatform) Name() string { return "windows" }

// GetLastShutdownTime queries the Windows event log for the last shutdown event.
func (p *WindowsPlatform) GetLastShutdownTime() (int64, error) {
	// Use wevtutil to get last shutdown event (Event ID 1074)
	cmd := exec.Command("wevtutil", "qe", "System",
		"/q:*[System[EventID=1074]]", "/c:1", "/rd:true", "/f:text")
	output, err := cmd.Output()
	if err != nil {
		return 0, err
	}
	_ = output // TODO: Parse the output for timestamp
	return 0, nil
}

// GetGPUTemperature attempts to read GPU temperature via nvidia-smi.
// Returns nil if NVIDIA GPU or nvidia-smi is not available.
func (p *WindowsPlatform) GetGPUTemperature() (*float64, error) {
	// Try nvidia-smi for NVIDIA GPUs
	cmd := exec.Command("nvidia-smi",
		"--query-gpu=temperature.gpu", "--format=csv,noheader,nounits")
	output, err := cmd.Output()
	if err != nil {
		return nil, nil // Not available
	}
	temp, err := strconv.ParseFloat(strings.TrimSpace(string(output)), 64)
	if err != nil {
		return nil, nil
	}
	return &temp, nil
}
