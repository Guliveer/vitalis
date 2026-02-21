//go:build linux || darwin

package config

import (
	"os"
	"path/filepath"
)

func configSearchPaths() []string {
	paths := []string{
		"./vitalis-config.yaml",
		"./agent.yaml",
	}
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		// Avoid duplicate if exe is in CWD
		newPath := filepath.Join(exeDir, "vitalis-config.yaml")
		if newPath != "./vitalis-config.yaml" {
			paths = append(paths, newPath)
		}
		legacyPath := filepath.Join(exeDir, "agent.yaml")
		if legacyPath != "./agent.yaml" {
			paths = append(paths, legacyPath)
		}
	}
	home, _ := os.UserHomeDir()
	if home != "" {
		paths = append(paths, filepath.Join(home, ".vitalis", "config.yaml"))
	}
	paths = append(paths, "/etc/vitalis/agent.yaml")
	return paths
}
