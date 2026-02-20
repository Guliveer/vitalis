//go:build linux || darwin

package config

import (
	"os"
	"path/filepath"
)

func configSearchPaths() []string {
	home, _ := os.UserHomeDir()
	return []string{
		filepath.Join(home, ".vitalis", "config.yaml"),
		"/etc/vitalis/agent.yaml",
	}
}
