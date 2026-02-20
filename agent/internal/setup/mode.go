package setup

import "fmt"

type InstallMode int

const (
	ModeSystem InstallMode = iota
	ModeUser
)

func (m InstallMode) String() string {
	switch m {
	case ModeSystem:
		return "system"
	case ModeUser:
		return "user"
	default:
		return "unknown"
	}
}

func ParseMode(s string) (InstallMode, error) {
	switch s {
	case "system":
		return ModeSystem, nil
	case "user":
		return ModeUser, nil
	default:
		return 0, fmt.Errorf("invalid install mode %q (expected \"system\" or \"user\")", s)
	}
}

type Paths struct {
	BinDir     string
	BinPath    string
	ConfigDir  string
	ConfigPath string
	DataDir    string
}
