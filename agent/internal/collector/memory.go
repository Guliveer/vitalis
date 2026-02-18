// RAM usage collector — gathers used and total memory bytes.
// Uses gopsutil for cross-platform memory metrics.
package collector

import (
	"context"

	"github.com/shirou/gopsutil/v3/mem"
)

// MemoryResult holds the collected memory usage data.
type MemoryResult struct {
	Used  uint64 `json:"used"`
	Total uint64 `json:"total"`
}

// MemoryCollector collects RAM usage metrics.
type MemoryCollector struct{}

// NewMemoryCollector creates a new memory collector.
func NewMemoryCollector() *MemoryCollector {
	return &MemoryCollector{}
}

// Name returns the collector identifier.
func (c *MemoryCollector) Name() string { return "memory" }

// Collect gathers memory usage data (used bytes, total bytes).
func (c *MemoryCollector) Collect(ctx context.Context) (interface{}, error) {
	v, err := mem.VirtualMemoryWithContext(ctx)
	if err != nil {
		return nil, err
	}
	return MemoryResult{
		Used:  v.Used,
		Total: v.Total,
	}, nil
}

// IsAvailable returns true — memory metrics are available on all platforms.
func (c *MemoryCollector) IsAvailable() bool { return true }
