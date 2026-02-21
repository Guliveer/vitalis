// Disk usage collector — gathers per-mount disk usage information.
// Uses gopsutil for cross-platform disk metrics.
package collector

import (
	"context"
	"strings"

	"github.com/shirou/gopsutil/v3/disk"
	"github.com/Guliveer/vitalis/agent/internal/models"
	"go.uber.org/zap"
)

// pseudoFSTypes contains filesystem types that should be excluded from disk metrics.
// These are virtual/system filesystems and network/remote filesystems that don't
// represent local storage devices.
var pseudoFSTypes = map[string]bool{
	// Virtual / system filesystems
	"devfs":         true,
	"autofs":        true,
	"nullfs":        true,
	"tmpfs":         true,
	"sysfs":         true,
	"proc":          true,
	"procfs":        true,
	"devtmpfs":      true,
	"cgroup":        true,
	"cgroup2":       true,
	"overlay":       true,
	"squashfs":      true,
	"fuse.snapfuse": true,
	"nsfs":          true,
	"pstore":        true,
	"debugfs":       true,
	"tracefs":       true,
	"securityfs":    true,
	"configfs":      true,
	"fusectl":       true,
	"mqueue":        true,
	"hugetlbfs":     true,
	"binfmt_misc":   true,
	"efivarfs":      true,
	"bpf":           true,
	"ramfs":         true,

	// Network / remote filesystems
	"nfs":            true,
	"nfs4":           true,
	"cifs":           true,
	"smbfs":          true,
	"fuse.sshfs":     true,
	"fuse.rclone":    true,
	"9p":             true,
	"afs":            true,
	"ncpfs":          true,
	"glusterfs":      true,
	"lustre":         true,
	"ceph":           true,
	"fuse.ceph":      true,
	"gpfs":           true,
	"pvfs2":          true,
	"fuse.s3fs":      true,
	"fuse.gcsfuse":   true,
	"fuse.blobfuse":  true,
	"davfs2":         true,
}

// isSystemMount returns true for mount points that are macOS system volumes
// or other OS-internal paths that shouldn't be shown to users.
func isSystemMount(mount string) bool {
	systemPrefixes := []string{
		"/System/Volumes/",
		"/private/var/vm",
	}
	for _, prefix := range systemPrefixes {
		if strings.HasPrefix(mount, prefix) {
			return true
		}
	}
	return false
}

// DiskCollector collects disk usage metrics per mount point.
type DiskCollector struct {
	logger *zap.Logger
}

// NewDiskCollector creates a new disk collector.
func NewDiskCollector(logger *zap.Logger) *DiskCollector {
	return &DiskCollector{logger: logger}
}

// Name returns the collector identifier.
func (c *DiskCollector) Name() string { return "disk" }

// Collect gathers disk usage data for all mounted partitions.
// Inaccessible partitions are silently skipped.
func (c *DiskCollector) Collect(ctx context.Context) (interface{}, error) {
	partitions, err := disk.PartitionsWithContext(ctx, false)
	if err != nil {
		return nil, err
	}

	var results []models.DiskInfo
	for _, p := range partitions {
		// Skip pseudo/network filesystems
		if pseudoFSTypes[p.Fstype] {
			c.logger.Debug("Skipping pseudo/network filesystem",
				zap.String("mount", p.Mountpoint),
				zap.String("fstype", p.Fstype))
			continue
		}
		// Skip macOS system mount points
		if isSystemMount(p.Mountpoint) {
			continue
		}

		usage, err := disk.UsageWithContext(ctx, p.Mountpoint)
		if err != nil {
			continue // Skip inaccessible partitions
		}
		// Skip partitions with 0 total bytes (some virtual mounts report 0 size)
		if usage.Total == 0 {
			continue
		}
		results = append(results, models.DiskInfo{
			Mount: p.Mountpoint,
			Fs:    p.Fstype,
			Total: usage.Total,
			Used:  usage.Used,
			Free:  usage.Free,
		})
	}

	return results, nil
}

// IsAvailable returns true — disk metrics are available on all platforms.
func (c *DiskCollector) IsAvailable() bool { return true }
