package autostart

// Mode determines whether the service is installed system-wide or per-user.
type Mode int

const (
	SystemMode Mode = iota // System-wide service (requires root/admin)
	UserMode               // Per-user service/agent
)

// Manager provides platform-specific autostart installation.
type Manager interface {
	IsInstalled() (bool, error)
	Install(execPath string) error
	Uninstall() error
	ServiceName() string
}
