// Last shutdown time collector — approximates last shutdown from boot time.
// Uses gopsutil host for boot time information.
package collector

import (
	"context"
	"time"

	"github.com/shirou/gopsutil/v3/host"
)

// ShutdownCollector collects the last boot time (as a proxy for last shutdown).
type ShutdownCollector struct{}

// NewShutdownCollector creates a new shutdown collector.
func NewShutdownCollector() *ShutdownCollector {
	return &ShutdownCollector{}
}

// Name returns the collector identifier.
func (c *ShutdownCollector) Name() string { return "shutdown" }

// Collect returns the boot time as an RFC3339 string.
// The last shutdown is approximated as just before the boot time.
func (c *ShutdownCollector) Collect(ctx context.Context) (interface{}, error) {
	bootTime, err := host.BootTimeWithContext(ctx)
	if err != nil {
		return nil, err
	}
	// Return boot time as ISO string
	return time.Unix(int64(bootTime), 0).UTC().Format(time.RFC3339), nil
}

// IsAvailable returns true — boot time is available on all platforms.
func (c *ShutdownCollector) IsAvailable() bool { return true }
