//go:build windows

package config

import (
	"os"
	"path/filepath"
)

func configSearchPaths() []string {
	paths := []string{
		".\\vitalis-config.yaml",
		".\\agent.yaml",
	}
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		newPath := filepath.Join(exeDir, "vitalis-config.yaml")
		if newPath != ".\\vitalis-config.yaml" {
			paths = append(paths, newPath)
		}
		legacyPath := filepath.Join(exeDir, "agent.yaml")
		if legacyPath != ".\\agent.yaml" {
			paths = append(paths, legacyPath)
		}
	}
	localApp := os.Getenv("LOCALAPPDATA")
	if localApp != "" {
		paths = append(paths, filepath.Join(localApp, "Vitalis", "config.yaml"))
	}
	programData := os.Getenv("ProgramData")
	if programData != "" {
		paths = append(paths, filepath.Join(programData, "Vitalis", "agent.yaml"))
	}
	return paths
}
