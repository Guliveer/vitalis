// Package models defines the metric data structures used throughout the agent.
// These structures are serialized to JSON for transmission to the API.
package models

import "time"

// MetricSnapshot represents a single point-in-time collection of all system metrics.
type MetricSnapshot struct {
	Timestamp     time.Time     `json:"timestamp"`
	CPUOverall    float64       `json:"cpu_overall"`
	CPUCores      []float64     `json:"cpu_cores"`
	RAMUsed       uint64        `json:"ram_used"`
	RAMTotal      uint64        `json:"ram_total"`
	DiskUsage     []DiskInfo    `json:"disk_usage"`
	NetworkRx     uint64        `json:"network_rx"`
	NetworkTx     uint64        `json:"network_tx"`
	UptimeSeconds int           `json:"uptime_seconds"`
	CPUTemp       *float64      `json:"cpu_temp"`
	GPUTemp       *float64      `json:"gpu_temp"`
	Processes     []ProcessInfo `json:"processes"`
}

// DiskInfo represents usage for a single disk/partition.
type DiskInfo struct {
	Mount string `json:"mount"`
	Fs    string `json:"fs,omitempty"`
	Total uint64 `json:"total"`
	Used  uint64 `json:"used"`
	Free  uint64 `json:"free"`
}

// ProcessInfo represents a single process's resource usage.
type ProcessInfo struct {
	PID    int32   `json:"pid"`
	Name   string  `json:"name"`
	CPU    float64 `json:"cpu"`
	Memory float64 `json:"memory"`
	Status string  `json:"status"`
}

// MetricBatch is the payload sent to the API via POST /api/ingest.
type MetricBatch struct {
	MachineToken string           `json:"machine_token"`
	Metrics      []MetricSnapshot `json:"metrics"`
}

// CollectorResult holds the output of a single collector run.
type CollectorResult struct {
	Name  string
	Data  interface{}
	Error error
}
