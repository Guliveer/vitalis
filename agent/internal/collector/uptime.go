// System uptime collector — gathers seconds since last boot.
// Uses gopsutil for cross-platform uptime metrics.
package collector

import (
	"context"

	"github.com/shirou/gopsutil/v3/host"
)

// UptimeCollector collects system uptime in seconds.
type UptimeCollector struct{}

// NewUptimeCollector creates a new uptime collector.
func NewUptimeCollector() *UptimeCollector {
	return &UptimeCollector{}
}

// Name returns the collector identifier.
func (c *UptimeCollector) Name() string { return "uptime" }

// Collect gathers the system uptime in seconds since boot.
func (c *UptimeCollector) Collect(ctx context.Context) (interface{}, error) {
	uptime, err := host.UptimeWithContext(ctx)
	if err != nil {
		return nil, err
	}
	return int(uptime), nil
}

// IsAvailable returns true — uptime is available on all platforms.
func (c *UptimeCollector) IsAvailable() bool { return true }
