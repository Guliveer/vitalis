//go:build windows

package config

import (
	"os"
	"path/filepath"
)

func configSearchPaths() []string {
	local := os.Getenv("LOCALAPPDATA")
	programData := os.Getenv("ProgramData")
	return []string{
		filepath.Join(local, "Vitalis", "config.yaml"),
		filepath.Join(programData, "Vitalis", "agent.yaml"),
	}
}
