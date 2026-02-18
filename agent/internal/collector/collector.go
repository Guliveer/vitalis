// Package collector defines the Collector interface and provides
// implementations for various system metric collectors.
package collector

import "context"

// Collector is the interface that all metric collectors must implement.
// Each collector gathers a specific type of system metric.
type Collector interface {
	// Name returns the unique identifier for this collector.
	Name() string

	// Collect gathers the metric data and returns it.
	// The context allows for cancellation and timeout control.
	Collect(ctx context.Context) (interface{}, error)

	// IsAvailable checks if this collector can run on the current platform.
	// Collectors that return false will not be registered.
	IsAvailable() bool
}
