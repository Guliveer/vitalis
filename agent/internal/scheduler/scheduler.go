// Package scheduler implements a tick-based periodic collection scheduler.
// It orchestrates metric collection at a configurable interval and batches
// snapshots for transmission. The scheduler does NOT send data directly —
// it invokes a callback when a batch is ready.
package scheduler

import (
	"context"
	"sync"
	"time"

	"go.uber.org/zap"

	"github.com/vitalis-app/agent/internal/collector"
	"github.com/vitalis-app/agent/internal/config"
	"github.com/vitalis-app/agent/internal/models"
)

// Scheduler manages periodic metric collection and batching.
type Scheduler struct {
	registry     *collector.Registry
	cfg          *config.Config
	logger       *zap.Logger

	batch        []models.MetricSnapshot
	batchMu      sync.Mutex

	onBatchReady func([]models.MetricSnapshot)
}

// New creates a new Scheduler with the given registry, config, and logger.
func New(registry *collector.Registry, cfg *config.Config, logger *zap.Logger) *Scheduler {
	return &Scheduler{
		registry: registry,
		cfg:      cfg,
		logger:   logger,
		batch:    make([]models.MetricSnapshot, 0),
	}
}

// OnBatchReady sets the callback invoked when a batch of metrics is ready to send.
// The callback receives the batch and is responsible for transmission/buffering.
func (s *Scheduler) OnBatchReady(fn func([]models.MetricSnapshot)) {
	s.onBatchReady = fn
}

// Start begins the collection and batching loops. It blocks until the context
// is cancelled. On shutdown, it flushes any remaining batch.
func (s *Scheduler) Start(ctx context.Context) {
	collectTicker := time.NewTicker(s.cfg.Collection.Interval.Duration)
	batchTicker := time.NewTicker(s.cfg.Collection.BatchInterval.Duration)

	defer collectTicker.Stop()
	defer batchTicker.Stop()

	// Do an initial collection immediately
	s.collect(ctx)

	for {
		select {
		case <-ctx.Done():
			// Flush remaining batch on shutdown
			s.flushBatch()
			return
		case <-collectTicker.C:
			s.collect(ctx)
		case <-batchTicker.C:
			s.flushBatch()
		}
	}
}

// collect runs all collectors with a timeout and assembles a snapshot.
func (s *Scheduler) collect(ctx context.Context) {
	collectCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	results := s.registry.CollectAll(collectCtx)
	snapshot := s.assembleSnapshot(results)

	s.batchMu.Lock()
	s.batch = append(s.batch, snapshot)
	s.batchMu.Unlock()

	s.logger.Debug("Collected metrics", zap.Time("timestamp", snapshot.Timestamp))
}

// flushBatch sends the current batch via the callback and resets the buffer.
func (s *Scheduler) flushBatch() {
	s.batchMu.Lock()
	if len(s.batch) == 0 {
		s.batchMu.Unlock()
		return
	}
	batch := s.batch
	s.batch = make([]models.MetricSnapshot, 0)
	s.batchMu.Unlock()

	s.logger.Info("Flushing batch", zap.Int("count", len(batch)))

	if s.onBatchReady != nil {
		s.onBatchReady(batch)
	}
}

// assembleSnapshot maps collector results into a unified MetricSnapshot.
func (s *Scheduler) assembleSnapshot(results map[string]interface{}) models.MetricSnapshot {
	snapshot := models.MetricSnapshot{
		Timestamp: time.Now().UTC(),
	}

	// CPU
	if data, ok := results["cpu"]; ok {
		if cpu, ok := data.(collector.CPUResult); ok {
			snapshot.CPUOverall = cpu.Overall
			snapshot.CPUCores = cpu.Cores
		}
	}

	// Memory
	if data, ok := results["memory"]; ok {
		if mem, ok := data.(collector.MemoryResult); ok {
			snapshot.RAMUsed = mem.Used
			snapshot.RAMTotal = mem.Total
		}
	}

	// Disk
	if data, ok := results["disk"]; ok {
		if disks, ok := data.([]models.DiskInfo); ok {
			snapshot.DiskUsage = disks
		}
	}

	// Network
	if data, ok := results["network"]; ok {
		if net, ok := data.(collector.NetworkResult); ok {
			snapshot.NetworkRx = net.Rx
			snapshot.NetworkTx = net.Tx
		}
	}

	// Uptime
	if data, ok := results["uptime"]; ok {
		if uptime, ok := data.(int); ok {
			snapshot.UptimeSeconds = uptime
		}
	}

	// Temperature
	if data, ok := results["temperature"]; ok {
		if temp, ok := data.(collector.TemperatureResult); ok {
			snapshot.CPUTemp = temp.CPUTemp
			snapshot.GPUTemp = temp.GPUTemp
		}
	}

	// Processes
	if data, ok := results["processes"]; ok {
		if procs, ok := data.([]models.ProcessInfo); ok {
			snapshot.Processes = procs
		}
	}

	// OS Info
	if data, ok := results["osinfo"]; ok {
		if osinfo, ok := data.(collector.OSInfoResult); ok {
			snapshot.OSVersion = osinfo.OSVersion
			snapshot.OSName = osinfo.OSName
		}
	}

	return snapshot
}
