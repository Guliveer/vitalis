//go:build windows

package setup

import (
	"fmt"
	"os"

	"golang.org/x/sys/windows"
)

func CheckElevation(mode InstallMode) error {
	if mode == ModeUser {
		return nil
	}
	var token windows.Token
	err := windows.OpenProcessToken(windows.CurrentProcess(), windows.TOKEN_QUERY, &token)
	if err != nil {
		return fmt.Errorf("cannot check elevation: %w", err)
	}
	defer token.Close()

	elevated := token.IsElevated()
	if !elevated {
		return fmt.Errorf("system-wide installation requires Administrator privileges\n\nRight-click and 'Run as administrator', or use:\n  %s --setup", os.Args[0])
	}
	return nil
}
