package setup

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/Guliveer/vitalis/agent/internal/autostart"
	"github.com/Guliveer/vitalis/agent/internal/config"
)

// Options holds the CLI flags passed to --setup.
type Options struct {
	Mode  string // "system", "user", or "" (interactive)
	URL   string // Server URL or "" (interactive)
	Token string // Machine token or "" (interactive)
}

// Run executes the setup wizard. If all Options are provided, runs non-interactively.
func Run(version string, opts Options) error {
	fmt.Printf("\nVitalis Agent Setup %s\n", version)
	fmt.Println(strings.Repeat("─", 30))
	fmt.Println()

	reader := bufio.NewReader(os.Stdin)

	// 1. Determine install mode
	mode, err := resolveMode(opts.Mode, reader)
	if err != nil {
		return err
	}

	// 2. Check elevation for system mode
	if err := CheckElevation(mode); err != nil {
		return err
	}

	// 3. Resolve paths
	paths := ResolvePaths(mode)

	// 4. Get server URL and token
	url, err := resolveValue(opts.URL, "Server URL", "", reader)
	if err != nil {
		return err
	}
	token, err := resolveValue(opts.Token, "Machine token", "", reader)
	if err != nil {
		return err
	}

	fmt.Println("\nInstalling...")

	// 5. Create directories
	for _, dir := range []string{paths.BinDir, paths.ConfigDir, paths.DataDir} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("creating directory %s: %w", dir, err)
		}
		fmt.Printf("  ✓ Created %s\n", dir)
	}

	// 6. Copy binary
	if err := copyBinary(paths.BinPath); err != nil {
		return fmt.Errorf("copying binary: %w", err)
	}
	fmt.Printf("  ✓ Copied binary → %s\n", paths.BinPath)

	// 7. Write config
	cfg := config.DefaultConfig()
	cfg.Server.URL = url
	cfg.Server.MachineToken = token
	cfg.Buffer.DBPath = paths.DataDir
	cfg.Logging.File = "" // Use system journal/stdout when running as service

	if err := config.WriteConfig(cfg, paths.ConfigPath); err != nil {
		return fmt.Errorf("writing config: %w", err)
	}
	fmt.Printf("  ✓ Written config → %s\n", paths.ConfigPath)

	// 8. Register service
	var autostartMode autostart.Mode
	if mode == ModeSystem {
		autostartMode = autostart.SystemMode
	} else {
		autostartMode = autostart.UserMode
	}
	mgr := autostart.NewWithMode(autostartMode)
	if err := mgr.Install(paths.BinPath); err != nil {
		return fmt.Errorf("registering service: %w", err)
	}
	fmt.Printf("  ✓ Registered service (%s)\n", mgr.ServiceName())

	fmt.Println("\nDone! Agent is running.")
	return nil
}

// copyBinary copies the current executable to the target path.
func copyBinary(dst string) error {
	src, err := os.Executable()
	if err != nil {
		return err
	}
	// Resolve symlinks to get actual path
	src, err = resolveExecPath(src)
	if err != nil {
		return err
	}
	dst, err = resolveTargetPath(dst)
	if err != nil {
		// Target doesn't exist yet, that's fine
		if !os.IsNotExist(err) {
			return err
		}
	}
	// If source and destination are the same, skip
	if src == dst {
		fmt.Printf("  (binary already in place)\n")
		return nil
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

func resolveExecPath(p string) (string, error) {
	return filepath.Abs(filepath.Clean(p))
}

func resolveTargetPath(p string) (string, error) {
	return filepath.Abs(filepath.Clean(p))
}

// resolveMode determines the install mode from flag or interactive prompt.
func resolveMode(flagValue string, reader *bufio.Reader) (InstallMode, error) {
	if flagValue != "" {
		return ParseMode(flagValue)
	}
	fmt.Println("Installation mode:")
	fmt.Println("  [1] System (per-machine) — requires root/admin")
	fmt.Println("  [2] User (per-user) — current user only")
	fmt.Print("> ")
	choice, _ := reader.ReadString('\n')
	choice = strings.TrimSpace(choice)
	switch choice {
	case "1":
		return ModeSystem, nil
	case "2":
		return ModeUser, nil
	default:
		return 0, fmt.Errorf("invalid choice %q", choice)
	}
}

// resolveValue gets a value from flag or interactive prompt.
func resolveValue(flagValue, prompt, defaultVal string, reader *bufio.Reader) (string, error) {
	if flagValue != "" {
		return flagValue, nil
	}
	if defaultVal != "" {
		fmt.Printf("%s [%s]: ", prompt, defaultVal)
	} else {
		fmt.Printf("%s: ", prompt)
	}
	val, _ := reader.ReadString('\n')
	val = strings.TrimSpace(val)
	if val == "" {
		return defaultVal, nil
	}
	return val, nil
}
