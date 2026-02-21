package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadLayered_CLIOverridesEverything(t *testing.T) {
	embedded := []byte("server:\n  url: \"https://embedded.example.com\"\n  machine_token: \"embedded_token\"")
	t.Setenv("SA_SERVER_URL", "https://env.example.com")
	cli := CLIOverrides{URL: "https://cli.example.com", Token: "cli_token"}

	cfg, err := LoadLayered(cli, embedded, "")
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Server.URL != "https://cli.example.com" {
		t.Errorf("URL = %q, want CLI override", cfg.Server.URL)
	}
	if cfg.Server.MachineToken != "cli_token" {
		t.Errorf("Token = %q, want CLI override", cfg.Server.MachineToken)
	}
}

func TestLoadLayered_EnvOverridesEmbed(t *testing.T) {
	embedded := []byte("server:\n  url: \"https://embedded.example.com\"\n  machine_token: \"embedded_token\"")
	t.Setenv("SA_SERVER_URL", "https://env.example.com")

	cfg, err := LoadLayered(CLIOverrides{}, embedded, "")
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Server.URL != "https://env.example.com" {
		t.Errorf("URL = %q, want env override", cfg.Server.URL)
	}
	if cfg.Server.MachineToken != "embedded_token" {
		t.Errorf("Token = %q, want embedded value", cfg.Server.MachineToken)
	}
}

func TestLoadLayered_DefaultsWhenEmpty(t *testing.T) {
	cfg, err := LoadLayered(CLIOverrides{}, nil, "")
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Collection.Interval.Duration.Seconds() != 15 {
		t.Errorf("Interval = %v, want 15s default", cfg.Collection.Interval.Duration)
	}
}

func TestWriteConfig_CreatesFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "sub", "config.yaml")

	cfg := DefaultConfig()
	cfg.Server.URL = "https://test.example.com"

	if err := WriteConfig(cfg, path); err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(data) == 0 {
		t.Error("config file is empty")
	}
}
