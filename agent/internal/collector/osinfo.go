// OS info collector — gathers OS name and version information.
// Uses platform-specific methods to determine the OS version:
//   - Linux: reads /etc/os-release
//   - macOS: uses sw_vers
//   - Windows: uses cmd /c ver and registry
//
// Results are cached since OS version rarely changes during runtime.
package collector

import (
	"context"
	"os/exec"
	"runtime"
	"strings"
	"sync"
)

// OSInfoResult holds the collected OS information.
type OSInfoResult struct {
	OSVersion string `json:"os_version"` // e.g., "14.2.1", "22.04", "10.0.22631"
	OSName    string `json:"os_name"`    // e.g., "macOS Sonoma", "Ubuntu", "Windows 11"
}

// OSInfoCollector collects OS name and version information.
// Results are cached after the first successful collection.
type OSInfoCollector struct {
	cache  *OSInfoResult
	once   sync.Once
}

// NewOSInfoCollector creates a new OS info collector.
func NewOSInfoCollector() *OSInfoCollector {
	return &OSInfoCollector{}
}

// Name returns the collector identifier.
func (c *OSInfoCollector) Name() string { return "osinfo" }

// Collect gathers OS name and version. Results are cached after the first call.
func (c *OSInfoCollector) Collect(ctx context.Context) (interface{}, error) {
	c.once.Do(func() {
		result := collectOSInfo(ctx)
		c.cache = &result
	})
	return *c.cache, nil
}

// IsAvailable returns true — OS info is available on all platforms.
func (c *OSInfoCollector) IsAvailable() bool { return true }

// collectOSInfo dispatches to platform-specific collection logic.
func collectOSInfo(ctx context.Context) OSInfoResult {
	switch runtime.GOOS {
	case "linux":
		return collectLinuxOSInfo(ctx)
	case "darwin":
		return collectDarwinOSInfo(ctx)
	case "windows":
		return collectWindowsOSInfo(ctx)
	default:
		return OSInfoResult{
			OSName:    runtime.GOOS,
			OSVersion: "unknown",
		}
	}
}

// collectLinuxOSInfo reads /etc/os-release to determine the Linux distribution
// name and version. Falls back to lsb_release if the file is unavailable.
func collectLinuxOSInfo(ctx context.Context) OSInfoResult {
	result := OSInfoResult{
		OSName:    "Linux",
		OSVersion: "unknown",
	}

	// Try reading /etc/os-release first (available on most modern distros)
	out, err := exec.CommandContext(ctx, "cat", "/etc/os-release").Output()
	if err == nil {
		fields := parseKeyValueFile(string(out))
		if name, ok := fields["NAME"]; ok {
			result.OSName = strings.Trim(name, "\"")
		}
		if version, ok := fields["VERSION_ID"]; ok {
			result.OSVersion = strings.Trim(version, "\"")
		}
		// If we have PRETTY_NAME, use it as the OS name for richer info
		if pretty, ok := fields["PRETTY_NAME"]; ok {
			result.OSName = strings.Trim(pretty, "\"")
		}
		return result
	}

	// Fallback: try lsb_release
	out, err = exec.CommandContext(ctx, "lsb_release", "-d", "-s").Output()
	if err == nil {
		result.OSName = strings.TrimSpace(string(out))
	}

	out, err = exec.CommandContext(ctx, "lsb_release", "-r", "-s").Output()
	if err == nil {
		result.OSVersion = strings.TrimSpace(string(out))
	}

	return result
}

// collectDarwinOSInfo uses sw_vers to determine macOS name and version.
func collectDarwinOSInfo(ctx context.Context) OSInfoResult {
	result := OSInfoResult{
		OSName:    "macOS",
		OSVersion: "unknown",
	}

	// Get product version (e.g., "14.2.1")
	out, err := exec.CommandContext(ctx, "sw_vers", "-productVersion").Output()
	if err == nil {
		result.OSVersion = strings.TrimSpace(string(out))
	}

	// Get product name (e.g., "macOS")
	out, err = exec.CommandContext(ctx, "sw_vers", "-productName").Output()
	if err == nil {
		name := strings.TrimSpace(string(out))
		if name != "" {
			result.OSName = name
		}
	}

	return result
}

// collectWindowsOSInfo uses PowerShell to determine Windows version information.
func collectWindowsOSInfo(ctx context.Context) OSInfoResult {
	result := OSInfoResult{
		OSName:    "Windows",
		OSVersion: "unknown",
	}

	// Use PowerShell to get OS caption and version
	out, err := exec.CommandContext(ctx, "powershell", "-NoProfile", "-Command",
		"(Get-CimInstance Win32_OperatingSystem).Caption").Output()
	if err == nil {
		caption := strings.TrimSpace(string(out))
		if caption != "" {
			result.OSName = caption
		}
	}

	out, err = exec.CommandContext(ctx, "powershell", "-NoProfile", "-Command",
		"(Get-CimInstance Win32_OperatingSystem).Version").Output()
	if err == nil {
		version := strings.TrimSpace(string(out))
		if version != "" {
			result.OSVersion = version
		}
	}

	return result
}

// parseKeyValueFile parses a file with KEY=VALUE lines (like /etc/os-release).
func parseKeyValueFile(content string) map[string]string {
	fields := make(map[string]string)
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			fields[parts[0]] = parts[1]
		}
	}
	return fields
}
