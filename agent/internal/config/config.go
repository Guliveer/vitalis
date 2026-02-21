// Package config handles configuration loading from YAML files and environment variables.
// Configuration precedence: environment variables > config file > defaults.
package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// Duration is a wrapper around time.Duration that supports YAML unmarshaling
// from human-readable strings like "15s", "30s", "1m".
type Duration struct {
	time.Duration
}

// UnmarshalYAML implements the yaml.Unmarshaler interface for Duration.
// It accepts both string formats ("15s", "1m30s") and integer nanoseconds.
func (d *Duration) UnmarshalYAML(value *yaml.Node) error {
	switch value.Kind {
	case yaml.ScalarNode:
		parsed, err := time.ParseDuration(value.Value)
		if err != nil {
			return fmt.Errorf("invalid duration %q: %w", value.Value, err)
		}
		d.Duration = parsed
		return nil
	default:
		return fmt.Errorf("unsupported duration format: %v", value.Kind)
	}
}

// MarshalYAML implements the yaml.Marshaler interface for Duration.
func (d Duration) MarshalYAML() (interface{}, error) {
	return d.Duration.String(), nil
}

// Config holds all agent configuration.
type Config struct {
	Server     ServerConfig     `yaml:"server"`
	Collection CollectionConfig `yaml:"collection"`
	Buffer     BufferConfig     `yaml:"buffer"`
	Logging    LoggingConfig    `yaml:"logging"`
	Update     UpdateConfig     `yaml:"update"`
}

// ServerConfig holds API server connection settings.
type ServerConfig struct {
	URL          string `yaml:"url"`
	MachineToken string `yaml:"machine_token"`
}

// CollectionConfig holds metric collection settings.
type CollectionConfig struct {
	Interval      Duration `yaml:"interval"`
	BatchInterval Duration `yaml:"batch_interval"`
	TopProcesses  int      `yaml:"top_processes"`
}

// BufferConfig holds local SQLite buffer settings.
type BufferConfig struct {
	MaxSizeMB int    `yaml:"max_size_mb"`
	DBPath    string `yaml:"db_path"`
}

// LoggingConfig holds logging settings.
type LoggingConfig struct {
	Level string `yaml:"level"`
	File  string `yaml:"file"`
}

// UpdateConfig holds auto-update settings.
type UpdateConfig struct {
	Enabled       bool     `yaml:"enabled"`
	CheckInterval Duration `yaml:"check_interval"`
}

// DefaultConfig returns the default configuration.
func DefaultConfig() *Config {
	return &Config{
		Server: ServerConfig{
			URL:          "http://localhost:3000",
			MachineToken: "",
		},
		Collection: CollectionConfig{
			Interval:      Duration{15 * time.Second},
			BatchInterval: Duration{30 * time.Second},
			TopProcesses:  10,
		},
		Buffer: BufferConfig{
			MaxSizeMB: 50,
			DBPath:    "./buffer.db",
		},
		Logging: LoggingConfig{
			Level: "info",
			File:  "./agent.log",
		},
		Update: UpdateConfig{
			Enabled:       false,
			CheckInterval: Duration{1 * time.Hour},
		},
	}
}

// LoadFromBytes parses YAML configuration from a byte slice and merges with defaults.
// Environment variables take highest precedence and override values from the byte slice.
func LoadFromBytes(data []byte) (*Config, error) {
	cfg := DefaultConfig()

	if len(data) > 0 {
		if err := yaml.Unmarshal(data, cfg); err != nil {
			return nil, fmt.Errorf("parsing config data: %w", err)
		}
	}

	// Environment variable overrides (highest precedence)
	applyEnvOverrides(cfg)

	return cfg, nil
}

// Load reads configuration from a YAML file and merges with defaults.
// If path is empty or the file does not exist, only defaults and environment
// variables are used.
func Load(path string) (*Config, error) {
	if path == "" {
		return LoadFromBytes(nil)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if !os.IsNotExist(err) {
			return nil, fmt.Errorf("reading config file: %w", err)
		}
		// File doesn't exist — use defaults + env overrides
		return LoadFromBytes(nil)
	}

	return LoadFromBytes(data)
}

// CLIOverrides holds values from command-line flags.
// Empty strings are treated as "not set" and skipped.
type CLIOverrides struct {
	URL   string
	Token string
}

// Locate searches standard config file paths and returns the first one found.
// Returns empty string if no config file exists.
func Locate() string {
	candidates := configSearchPaths()
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

// LoadLayered loads configuration with the full precedence chain:
// CLI flags > env vars > external YAML file > embedded bytes > defaults.
//
// An optional configPath argument controls external-file discovery:
//   - omitted        → auto-discover via Locate()
//   - explicit value  → use that path ("" means no external file)
func LoadLayered(cli CLIOverrides, embedded []byte, configPath ...string) (*Config, error) {
	cfg := DefaultConfig()

	// Layer 1: embedded config (lowest priority data layer)
	if len(embedded) > 0 {
		if err := yaml.Unmarshal(embedded, cfg); err != nil {
			return nil, fmt.Errorf("parsing embedded config: %w", err)
		}
	}

	// Layer 2: external YAML file
	var filePath string
	if len(configPath) > 0 {
		filePath = configPath[0] // caller-supplied (may be "")
	} else {
		filePath = Locate() // auto-discover
	}
	if filePath != "" {
		data, err := os.ReadFile(filePath)
		if err == nil {
			if err := yaml.Unmarshal(data, cfg); err != nil {
				return nil, fmt.Errorf("parsing config file %s: %w", filePath, err)
			}
		}
	}

	// Layer 3: environment variables
	applyEnvOverrides(cfg)

	// Layer 4: CLI flags (highest priority)
	if cli.URL != "" {
		cfg.Server.URL = cli.URL
	}
	if cli.Token != "" {
		cfg.Server.MachineToken = cli.Token
	}

	return cfg, nil
}

// WriteConfig serializes the config to a YAML file at the given path.
// Creates parent directories if needed.
func WriteConfig(cfg *Config, path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return fmt.Errorf("creating config directory: %w", err)
	}
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("marshaling config: %w", err)
	}
	return os.WriteFile(path, data, 0640)
}

// applyEnvOverrides applies environment variable overrides to the configuration.
// Environment variables have the highest precedence.
func applyEnvOverrides(cfg *Config) {
	if url := os.Getenv("SA_SERVER_URL"); url != "" {
		cfg.Server.URL = url
	}
	if token := os.Getenv("SA_MACHINE_TOKEN"); token != "" {
		cfg.Server.MachineToken = token
	}
	if level := os.Getenv("SA_LOG_LEVEL"); level != "" {
		cfg.Logging.Level = level
	}
}

// Validate checks that the configuration is valid for production use.
// Returns an error if required fields are missing or if HTTPS is not used
// for non-localhost server URLs (MEDIUM-6).
func (c *Config) Validate() error {
	if c.Server.URL == "" {
		return fmt.Errorf("server URL is required")
	}
	if c.Server.MachineToken == "" {
		return fmt.Errorf("machine token is required")
	}
	if !strings.HasPrefix(c.Server.URL, "https://") {
		// Allow localhost for development
		if !strings.Contains(c.Server.URL, "localhost") && !strings.Contains(c.Server.URL, "127.0.0.1") {
			return fmt.Errorf("server URL must use HTTPS (got: %s)", c.Server.URL)
		}
	}
	return nil
}
