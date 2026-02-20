//go:build darwin

package setup

import (
	"os"
	"path/filepath"
)

func ResolvePaths(mode InstallMode) Paths {
	if mode == ModeUser {
		home, _ := os.UserHomeDir()
		base := filepath.Join(home, ".vitalis")
		return Paths{
			BinDir:     filepath.Join(base, "bin"),
			BinPath:    filepath.Join(base, "bin", "vitalis-agent"),
			ConfigDir:  base,
			ConfigPath: filepath.Join(base, "config.yaml"),
			DataDir:    filepath.Join(base, "data"),
		}
	}
	return Paths{
		BinDir:     "/opt/vitalis",
		BinPath:    "/opt/vitalis/vitalis-agent",
		ConfigDir:  "/etc/vitalis",
		ConfigPath: "/etc/vitalis/agent.yaml",
		DataDir:    "/var/lib/vitalis",
	}
}
