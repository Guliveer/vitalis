// CPU/GPU temperature collector — gathers thermal sensor readings.
// Uses gopsutil host sensors for temperature data.
// Temperature sensors may not be available on all platforms.
package collector

import (
	"context"
	"strings"

	"github.com/shirou/gopsutil/v3/host"
)

// TemperatureResult holds the collected temperature data.
// Nil pointers indicate the sensor was not found.
type TemperatureResult struct {
	CPUTemp *float64 `json:"cpu_temp"`
	GPUTemp *float64 `json:"gpu_temp"`
}

// TemperatureCollector collects CPU and GPU temperature readings.
type TemperatureCollector struct{}

// NewTemperatureCollector creates a new temperature collector.
func NewTemperatureCollector() *TemperatureCollector {
	return &TemperatureCollector{}
}

// Name returns the collector identifier.
func (c *TemperatureCollector) Name() string { return "temperature" }

// Collect gathers CPU and GPU temperature data from available sensors.
// Returns nil temperatures if sensors are not available — this is not an error.
func (c *TemperatureCollector) Collect(ctx context.Context) (interface{}, error) {
	temps, err := host.SensorsTemperaturesWithContext(ctx)
	if err != nil {
		// Temperature sensors may not be available — not an error
		return TemperatureResult{}, nil
	}

	result := TemperatureResult{}

	for _, t := range temps {
		name := strings.ToLower(t.SensorKey)
		if result.CPUTemp == nil && (strings.Contains(name, "cpu") || strings.Contains(name, "core") || strings.Contains(name, "package")) {
			temp := t.Temperature
			result.CPUTemp = &temp
		}
		if result.GPUTemp == nil && (strings.Contains(name, "gpu") || strings.Contains(name, "nvidia") || strings.Contains(name, "amd")) {
			temp := t.Temperature
			result.GPUTemp = &temp
		}
	}

	return result, nil
}

// IsAvailable returns true — always registered; returns nil temps if sensors unavailable.
func (c *TemperatureCollector) IsAvailable() bool { return true }
