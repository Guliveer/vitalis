// Package buffer provides a local file-based buffer for offline metric storage.
// Metrics are written as timestamped JSON files when the API is unavailable.
// Data persists across crashes and reboots. Auto-cleanup enforces size limits.
package buffer

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"

	"go.uber.org/zap"

	"github.com/Guliveer/vitalis/agent/internal/models"
)

// Buffer provides local file-based storage for metrics when the API is unavailable.
// Each batch is stored as a separate timestamped JSON file in the configured directory.
type Buffer struct {
	dir       string
	maxSizeMB int
	logger    *zap.Logger
	mu        sync.Mutex
}

// New creates a new file-based buffer at the given directory path.
// The directory is created if it does not exist.
func New(dir string, maxSizeMB int, logger *zap.Logger) (*Buffer, error) {
	if err := os.MkdirAll(dir, 0750); err != nil {
		return nil, err
	}
	return &Buffer{
		dir:       dir,
		maxSizeMB: maxSizeMB,
		logger:    logger,
	}, nil
}

// Store saves a batch of metrics to a timestamped JSON file.
// If the buffer exceeds the configured size limit, the oldest batch is dropped.
func (b *Buffer) Store(metrics []models.MetricSnapshot) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	// Enforce size limit by dropping oldest batches
	if b.currentSizeMB() >= b.maxSizeMB {
		b.logger.Warn("Buffer full, dropping oldest batch")
		b.dropOldest()
	}

	filename := filepath.Join(b.dir, time.Now().UTC().Format("20060102T150405.000")+".json")
	data, err := json.Marshal(metrics)
	if err != nil {
		return err
	}

	return os.WriteFile(filename, data, 0640)
}

// RetrieveAll reads all buffered batches and removes the corresponding files.
// Corrupted files are removed and logged. Returns batches in chronological order.
func (b *Buffer) RetrieveAll() ([][]models.MetricSnapshot, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	entries, err := os.ReadDir(b.dir)
	if err != nil {
		return nil, err
	}

	var batches [][]models.MetricSnapshot
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}

		path := filepath.Join(b.dir, entry.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			b.logger.Warn("Failed to read buffer file",
				zap.String("file", path),
				zap.Error(err))
			continue
		}

		var batch []models.MetricSnapshot
		if err := json.Unmarshal(data, &batch); err != nil {
			b.logger.Warn("Failed to parse buffer file, removing corrupted file",
				zap.String("file", path),
				zap.Error(err))
			os.Remove(path)
			continue
		}

		batches = append(batches, batch)
		os.Remove(path) // Remove after successful read
	}

	return batches, nil
}

// Count returns the number of buffered batch files.
func (b *Buffer) Count() int {
	entries, err := os.ReadDir(b.dir)
	if err != nil {
		return 0
	}
	count := 0
	for _, e := range entries {
		if !e.IsDir() && filepath.Ext(e.Name()) == ".json" {
			count++
		}
	}
	return count
}

// currentSizeMB returns the total size of all buffer files in megabytes.
// Must be called with b.mu held.
func (b *Buffer) currentSizeMB() int {
	var totalSize int64
	entries, err := os.ReadDir(b.dir)
	if err != nil {
		return 0
	}
	for _, entry := range entries {
		if info, err := entry.Info(); err == nil {
			totalSize += info.Size()
		}
	}
	return int(totalSize / (1024 * 1024))
}

// dropOldest removes the oldest buffer file to free space.
// Must be called with b.mu held.
func (b *Buffer) dropOldest() {
	entries, err := os.ReadDir(b.dir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if !entry.IsDir() && filepath.Ext(entry.Name()) == ".json" {
			path := filepath.Join(b.dir, entry.Name())
			if err := os.Remove(path); err != nil {
				b.logger.Warn("Failed to remove oldest buffer file",
					zap.String("file", path),
					zap.Error(err))
			}
			return // Remove just one
		}
	}
}
