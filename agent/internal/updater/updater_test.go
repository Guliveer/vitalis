package updater

import (
	"testing"
)

func TestIsNewer(t *testing.T) {
	tests := []struct {
		latest   string
		current  string
		expected bool
	}{
		{"v2", "v1", true},
		{"v10", "v9", true},
		{"v100", "v42", true},
		{"v1", "v1", false},
		{"v1", "v2", false},
		{"v5", "v10", false},
		// With and without v prefix
		{"v3", "2", true},
		{"3", "v2", true},
		// Invalid versions
		{"dev", "v1", false},
		{"v1", "dev", false},
		{"", "v1", false},
	}

	for _, tt := range tests {
		name := tt.latest + "_vs_" + tt.current
		t.Run(name, func(t *testing.T) {
			result := isNewer(tt.latest, tt.current)
			if result != tt.expected {
				t.Errorf("isNewer(%q, %q) = %v, want %v", tt.latest, tt.current, result, tt.expected)
			}
		})
	}
}

func TestParseVersionNumber(t *testing.T) {
	tests := []struct {
		input    string
		expected int
	}{
		{"v1", 1},
		{"v42", 42},
		{"v100", 100},
		{"1", 1},
		{"42", 42},
		{"dev", 0},
		{"", 0},
		{"vABC", 0},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := parseVersionNumber(tt.input)
			if result != tt.expected {
				t.Errorf("parseVersionNumber(%q) = %d, want %d", tt.input, result, tt.expected)
			}
		})
	}
}

func TestBinaryNameForPlatform(t *testing.T) {
	tests := []struct {
		goos     string
		goarch   string
		expected string
	}{
		{"linux", "amd64", "vitalis-agent-linux-amd64"},
		{"darwin", "arm64", "vitalis-agent-darwin-arm64"},
		{"darwin", "amd64", "vitalis-agent-darwin-amd64"},
		{"windows", "amd64", "vitalis-agent-windows-amd64.exe"},
	}

	for _, tt := range tests {
		name := tt.goos + "_" + tt.goarch
		t.Run(name, func(t *testing.T) {
			result := binaryNameForPlatform(tt.goos, tt.goarch)
			if result != tt.expected {
				t.Errorf("binaryNameForPlatform(%q, %q) = %q, want %q", tt.goos, tt.goarch, result, tt.expected)
			}
		})
	}
}

func TestDefaultConfig(t *testing.T) {
	cfg := DefaultConfig()
	if cfg.Enabled {
		t.Error("default config should have Enabled=false")
	}
	if cfg.CheckInterval.Hours() != 1 {
		t.Errorf("default check interval should be 1h, got %v", cfg.CheckInterval)
	}
}
