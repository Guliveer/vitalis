// CPU/GPU temperature collector — gathers thermal sensor readings.
// Uses gopsutil host sensors for temperature data with platform-specific
// fallbacks for GPU temperature. Collects the maximum (hottest) reading
// across all matching sensors to represent the worst-case thermal state.
package collector

import (
	"context"
	"strings"

	"github.com/shirou/gopsutil/v3/host"
	"go.uber.org/zap"

	"github.com/vitalis-app/agent/internal/platform"
)

// Sensor name substrings used to identify CPU temperature sensors across platforms.
// Linux:  coretemp_core_0_input, k10temp_tctl_input, acpitz_temp1_input, zenpower_tctl_input
// macOS:  TC0P (CPU proximity), TC0D (CPU die), TCXC (CPU core)
// Windows: CPU Package, CPU Core #0, etc.
var cpuSensorKeys = []string{
	"cpu", "core", "package",
	"tctl", "tdie", "k10temp", "coretemp",
	"tc0p", "tc0d", "tcxc",
	"acpitz", "zenpower",
}

// Sensor name substrings used to identify GPU temperature sensors across platforms.
// Linux:  amdgpu_edge_input, nouveau_temp1_input
// macOS:  TG0P (GPU proximity), TG0D (GPU die)
// Windows: GPU, nvidia, radeon, etc.
var gpuSensorKeys = []string{
	"gpu", "nvidia", "amd", "radeon",
	"tg0p", "tg0d",
	"amdgpu", "nouveau",
}

// minValidTemp is the minimum temperature (°C) considered valid.
const minValidTemp = 0.0

// maxValidTemp is the maximum temperature (°C) considered valid.
// Readings above this are likely sensor errors.
const maxValidTemp = 150.0

// TemperatureResult holds the collected temperature data.
// Nil pointers indicate the sensor was not found.
type TemperatureResult struct {
	CPUTemp *float64 `json:"cpu_temp"`
	GPUTemp *float64 `json:"gpu_temp"`
}

// TemperatureCollector collects CPU and GPU temperature readings.
// It accepts an optional Platform for GPU temperature fallback.
type TemperatureCollector struct {
	platform platform.Platform
	logger   *zap.Logger
}

// NewTemperatureCollector creates a new temperature collector.
// The platform parameter provides a fallback for GPU temperature
// (e.g., nvidia-smi on Windows). Pass nil if no platform fallback is needed.
// The logger parameter is used for debug logging. Pass nil for no logging.
func NewTemperatureCollector(p platform.Platform, logger *zap.Logger) *TemperatureCollector {
	if logger == nil {
		logger = zap.NewNop()
	}
	return &TemperatureCollector{
		platform: p,
		logger:   logger,
	}
}

// Name returns the collector identifier.
func (c *TemperatureCollector) Name() string { return "temperature" }

// Collect gathers CPU and GPU temperature data from available sensors.
// It finds the maximum temperature across all matching sensors for each
// category (CPU/GPU). Returns nil temperatures if sensors are not available.
// Falls back to the platform interface for GPU temperature if no GPU
// sensor is found via gopsutil.
func (c *TemperatureCollector) Collect(ctx context.Context) (interface{}, error) {
	temps, err := host.SensorsTemperaturesWithContext(ctx)
	if err != nil {
		c.logger.Debug("Temperature sensors not available via gopsutil",
			zap.Error(err))
		// Fall through — we may still get GPU temp from the platform fallback
	}

	result := TemperatureResult{}
	var cpuMax, gpuMax float64
	cpuFound, gpuFound := false, false

	for _, t := range temps {
		if !isValidTemperature(t.Temperature) {
			continue
		}

		name := strings.ToLower(t.SensorKey)

		if matchesSensor(name, cpuSensorKeys) {
			if !cpuFound || t.Temperature > cpuMax {
				cpuMax = t.Temperature
				cpuFound = true
			}
		}

		if matchesSensor(name, gpuSensorKeys) {
			if !gpuFound || t.Temperature > gpuMax {
				gpuMax = t.Temperature
				gpuFound = true
			}
		}
	}

	if cpuFound {
		result.CPUTemp = &cpuMax
		c.logger.Debug("CPU temperature collected",
			zap.Float64("temp_c", cpuMax))
	} else {
		c.logger.Debug("No CPU temperature sensor found")
	}

	if gpuFound {
		result.GPUTemp = &gpuMax
		c.logger.Debug("GPU temperature collected from sensor",
			zap.Float64("temp_c", gpuMax))
	} else {
		// Fallback: try platform-specific GPU temperature (e.g., nvidia-smi)
		result.GPUTemp = c.platformGPUFallback()
	}

	return result, nil
}

// IsAvailable returns true — always registered; returns nil temps if sensors unavailable.
func (c *TemperatureCollector) IsAvailable() bool { return true }

// platformGPUFallback attempts to get GPU temperature from the platform interface.
// Returns nil if the platform is not set or the temperature is unavailable/invalid.
func (c *TemperatureCollector) platformGPUFallback() *float64 {
	if c.platform == nil {
		c.logger.Debug("No platform fallback available for GPU temperature")
		return nil
	}

	temp, err := c.platform.GetGPUTemperature()
	if err != nil {
		c.logger.Debug("Platform GPU temperature fallback failed",
			zap.Error(err))
		return nil
	}

	if temp == nil {
		c.logger.Debug("Platform GPU temperature not available")
		return nil
	}

	if !isValidTemperature(*temp) {
		c.logger.Debug("Platform GPU temperature out of valid range",
			zap.Float64("temp_c", *temp))
		return nil
	}

	c.logger.Debug("GPU temperature collected from platform fallback",
		zap.Float64("temp_c", *temp))
	return temp
}

// matchesSensor checks if the sensor name contains any of the given key substrings.
func matchesSensor(name string, keys []string) bool {
	for _, key := range keys {
		if strings.Contains(name, key) {
			return true
		}
	}
	return false
}

// isValidTemperature returns true if the temperature is within a plausible range.
func isValidTemperature(temp float64) bool {
	return temp > minValidTemp && temp <= maxValidTemp
}
