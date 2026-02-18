// CPU usage collector — gathers overall and per-core CPU utilization.
// Uses gopsutil for cross-platform CPU metrics.
package collector

import (
	"context"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
)

// CPUResult holds the collected CPU usage data.
type CPUResult struct {
	Overall float64   `json:"overall"`
	Cores   []float64 `json:"cores"`
}

// CPUCollector collects CPU usage metrics.
type CPUCollector struct{}

// NewCPUCollector creates a new CPU collector.
func NewCPUCollector() *CPUCollector {
	return &CPUCollector{}
}

// Name returns the collector identifier.
func (c *CPUCollector) Name() string { return "cpu" }

// Collect gathers CPU usage data (overall percentage and per-core).
// The overall measurement blocks for 1 second to compute an accurate percentage.
func (c *CPUCollector) Collect(ctx context.Context) (interface{}, error) {
	// Overall CPU usage (blocking for 1 second to measure)
	overall, err := cpu.PercentWithContext(ctx, time.Second, false)
	if err != nil {
		return nil, err
	}

	// Per-core usage (instantaneous snapshot)
	cores, err := cpu.PercentWithContext(ctx, 0, true)
	if err != nil {
		// Non-fatal: return overall only
		cores = nil
	}

	result := CPUResult{
		Cores: cores,
	}
	if len(overall) > 0 {
		result.Overall = overall[0]
	}

	return result, nil
}

// IsAvailable returns true — CPU metrics are available on all platforms.
func (c *CPUCollector) IsAvailable() bool { return true }
