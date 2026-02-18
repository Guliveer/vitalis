// Top N processes collector — gathers the most resource-intensive processes.
// Uses gopsutil for cross-platform process listing.
package collector

import (
	"context"
	"sort"

	"github.com/shirou/gopsutil/v3/process"
	"github.com/vitalis-app/agent/internal/models"
)

// ProcessCollector collects the top N processes by CPU usage.
type ProcessCollector struct {
	topN int
}

// NewProcessCollector creates a new process collector that returns the top N
// processes sorted by CPU usage descending.
func NewProcessCollector(topN int) *ProcessCollector {
	return &ProcessCollector{topN: topN}
}

// Name returns the collector identifier.
func (c *ProcessCollector) Name() string { return "processes" }

// Collect gathers the top N processes sorted by CPU usage descending.
// Individual process errors are silently skipped to avoid failing the
// entire collection due to a single inaccessible process.
func (c *ProcessCollector) Collect(ctx context.Context) (interface{}, error) {
	procs, err := process.ProcessesWithContext(ctx)
	if err != nil {
		return nil, err
	}

	var infos []models.ProcessInfo
	for _, p := range procs {
		name, _ := p.NameWithContext(ctx)
		cpuPct, _ := p.CPUPercentWithContext(ctx)
		memPct, _ := p.MemoryPercentWithContext(ctx)
		status, _ := p.StatusWithContext(ctx)

		statusStr := ""
		if len(status) > 0 {
			statusStr = status[0]
		}

		infos = append(infos, models.ProcessInfo{
			PID:    p.Pid,
			Name:   name,
			CPU:    cpuPct,
			Memory: float64(memPct),
			Status: statusStr,
		})
	}

	// Sort by CPU usage descending
	sort.Slice(infos, func(i, j int) bool {
		return infos[i].CPU > infos[j].CPU
	})

	// Return top N
	if len(infos) > c.topN {
		infos = infos[:c.topN]
	}

	return infos, nil
}

// IsAvailable returns true — process listing is available on all platforms.
func (c *ProcessCollector) IsAvailable() bool { return true }
