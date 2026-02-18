// Package collector provides a registry for managing metric collectors.
// Collectors are registered at startup; the scheduler queries the registry
// to run all available collectors concurrently.
package collector

import (
	"context"
	"sync"

	"go.uber.org/zap"
)

// Registry manages all registered collectors and orchestrates concurrent collection.
type Registry struct {
	collectors []Collector
	logger     *zap.Logger
}

// NewRegistry creates a new collector registry with the given logger.
func NewRegistry(logger *zap.Logger) *Registry {
	return &Registry{
		collectors: make([]Collector, 0),
		logger:     logger,
	}
}

// Register adds a collector if it's available on the current platform.
// Unavailable collectors are logged and skipped.
func (r *Registry) Register(c Collector) {
	if c.IsAvailable() {
		r.collectors = append(r.collectors, c)
		r.logger.Info("Registered collector", zap.String("name", c.Name()))
	} else {
		r.logger.Warn("Collector not available, skipping", zap.String("name", c.Name()))
	}
}

// CollectAll runs all registered collectors concurrently and returns a map
// of collector name -> result data. Failed collectors are logged but do not
// prevent other collectors from completing.
func (r *Registry) CollectAll(ctx context.Context) map[string]interface{} {
	results := make(map[string]interface{})
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, c := range r.collectors {
		wg.Add(1)
		go func(col Collector) {
			defer wg.Done()
			data, err := col.Collect(ctx)
			if err != nil {
				r.logger.Error("Collection failed",
					zap.String("collector", col.Name()),
					zap.Error(err))
				return
			}
			mu.Lock()
			results[col.Name()] = data
			mu.Unlock()
		}(c)
	}

	wg.Wait()
	return results
}

// Collectors returns a copy of all registered collectors.
func (r *Registry) Collectors() []Collector {
	result := make([]Collector, len(r.collectors))
	copy(result, r.collectors)
	return result
}
