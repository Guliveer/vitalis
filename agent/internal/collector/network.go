// Network I/O collector — gathers RX/TX byte counters and computes deltas.
// Uses gopsutil for cross-platform network metrics.
package collector

import (
	"context"

	"github.com/shirou/gopsutil/v3/net"
)

// NetworkResult holds the collected network I/O delta data.
type NetworkResult struct {
	Rx uint64 `json:"rx"`
	Tx uint64 `json:"tx"`
}

// NetworkCollector collects network I/O metrics (bytes received/transmitted).
// It tracks previous readings to compute deltas between collections.
type NetworkCollector struct {
	lastRx      uint64
	lastTx      uint64
	initialized bool
}

// NewNetworkCollector creates a new network collector.
func NewNetworkCollector() *NetworkCollector {
	return &NetworkCollector{}
}

// Name returns the collector identifier.
func (c *NetworkCollector) Name() string { return "network" }

// Collect gathers network I/O data (RX/TX bytes delta since last collection).
// The first collection returns zero deltas while establishing a baseline.
func (c *NetworkCollector) Collect(ctx context.Context) (interface{}, error) {
	counters, err := net.IOCountersWithContext(ctx, false)
	if err != nil {
		return nil, err
	}

	if len(counters) == 0 {
		return NetworkResult{}, nil
	}

	totalRx := counters[0].BytesRecv
	totalTx := counters[0].BytesSent

	// Calculate delta since last collection
	var deltaRx, deltaTx uint64
	if c.initialized {
		deltaRx = totalRx - c.lastRx
		deltaTx = totalTx - c.lastTx
	}

	c.lastRx = totalRx
	c.lastTx = totalTx
	c.initialized = true

	return NetworkResult{
		Rx: deltaRx,
		Tx: deltaTx,
	}, nil
}

// IsAvailable returns true — network metrics are available on all platforms.
func (c *NetworkCollector) IsAvailable() bool { return true }
