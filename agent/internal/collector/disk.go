// Disk usage collector — gathers per-mount disk usage information.
// Uses gopsutil for cross-platform disk metrics.
package collector

import (
	"context"

	"github.com/shirou/gopsutil/v3/disk"
	"github.com/vitalis-app/agent/internal/models"
)

// DiskCollector collects disk usage metrics per mount point.
type DiskCollector struct{}

// NewDiskCollector creates a new disk collector.
func NewDiskCollector() *DiskCollector {
	return &DiskCollector{}
}

// Name returns the collector identifier.
func (c *DiskCollector) Name() string { return "disk" }

// Collect gathers disk usage data for all mounted partitions.
// Inaccessible partitions are silently skipped.
func (c *DiskCollector) Collect(ctx context.Context) (interface{}, error) {
	partitions, err := disk.PartitionsWithContext(ctx, false)
	if err != nil {
		return nil, err
	}

	var results []models.DiskInfo
	for _, p := range partitions {
		usage, err := disk.UsageWithContext(ctx, p.Mountpoint)
		if err != nil {
			continue // Skip inaccessible partitions
		}
		results = append(results, models.DiskInfo{
			Mount: p.Mountpoint,
			Total: usage.Total,
			Used:  usage.Used,
			Free:  usage.Free,
		})
	}

	return results, nil
}

// IsAvailable returns true — disk metrics are available on all platforms.
func (c *DiskCollector) IsAvailable() bool { return true }
