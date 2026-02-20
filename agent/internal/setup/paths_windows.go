//go:build windows

package setup

import (
	"os"
	"path/filepath"
)

func ResolvePaths(mode InstallMode) Paths {
	if mode == ModeUser {
		local := os.Getenv("LOCALAPPDATA")
		base := filepath.Join(local, "Vitalis")
		return Paths{
			BinDir:     base,
			BinPath:    filepath.Join(base, "vitalis-agent.exe"),
			ConfigDir:  base,
			ConfigPath: filepath.Join(base, "config.yaml"),
			DataDir:    base,
		}
	}
	programData := os.Getenv("ProgramData")
	programFiles := os.Getenv("ProgramFiles")
	return Paths{
		BinDir:     filepath.Join(programFiles, "Vitalis"),
		BinPath:    filepath.Join(programFiles, "Vitalis", "vitalis-agent.exe"),
		ConfigDir:  filepath.Join(programData, "Vitalis"),
		ConfigPath: filepath.Join(programData, "Vitalis", "agent.yaml"),
		DataDir:    filepath.Join(programData, "Vitalis"),
	}
}
