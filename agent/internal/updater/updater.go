// Package updater implements automatic agent binary updates via GitHub Releases.
// It periodically checks for new releases, downloads the binary, verifies its
// SHA-256 checksum, and performs a platform-specific binary replacement + restart.
package updater

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"
)

// Config holds auto-update configuration.
type Config struct {
	Enabled       bool          `yaml:"enabled"`
	CheckInterval time.Duration `yaml:"check_interval"`
}

// DefaultConfig returns the default update configuration.
func DefaultConfig() Config {
	return Config{
		Enabled:       false,
		CheckInterval: 1 * time.Hour,
	}
}

// githubRelease represents a GitHub API release response (only fields we need).
type githubRelease struct {
	TagName    string        `json:"tag_name"`
	Prerelease bool          `json:"prerelease"`
	Assets     []githubAsset `json:"assets"`
}

// githubAsset represents a release asset.
type githubAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

// Updater manages automatic agent updates.
type Updater struct {
	currentVersion string
	config         Config
	logger         *zap.Logger
	httpClient     *http.Client
	repoOwner      string
	repoName       string

	mu      sync.Mutex
	cancel  context.CancelFunc
	stopped chan struct{}
}

const (
	githubAPIBase = "https://api.github.com"
	userAgent     = "vitalis-agent-updater"
	checksumFile  = "checksums.txt"
)

// New creates a new Updater instance.
func New(currentVersion string, cfg Config, logger *zap.Logger) *Updater {
	return &Updater{
		currentVersion: currentVersion,
		config:         cfg,
		logger:         logger.Named("updater"),
		httpClient: &http.Client{
			Timeout: 60 * time.Second,
		},
		repoOwner: "vitalis-app",
		repoName:  "vitalis",
		stopped:   make(chan struct{}),
	}
}

// Start begins the periodic update check loop.
func (u *Updater) Start(ctx context.Context) {
	if !u.config.Enabled {
		u.logger.Info("auto-update is disabled")
		return
	}

	if u.currentVersion == "dev" {
		u.logger.Info("running dev build, auto-update disabled")
		return
	}

	ctx, u.cancel = context.WithCancel(ctx)

	go u.loop(ctx)
	u.logger.Info("auto-update started",
		zap.String("current_version", u.currentVersion),
		zap.Duration("check_interval", u.config.CheckInterval),
	)
}

// Stop gracefully stops the update loop.
func (u *Updater) Stop() {
	if u.cancel != nil {
		u.cancel()
		<-u.stopped
	}
}

func (u *Updater) loop(ctx context.Context) {
	defer close(u.stopped)

	// Initial delay to let the agent fully start.
	select {
	case <-time.After(30 * time.Second):
	case <-ctx.Done():
		return
	}

	ticker := time.NewTicker(u.config.CheckInterval)
	defer ticker.Stop()

	// Check immediately after the initial delay, then on interval.
	u.checkAndUpdate(ctx)

	for {
		select {
		case <-ticker.C:
			u.checkAndUpdate(ctx)
		case <-ctx.Done():
			return
		}
	}
}

func (u *Updater) checkAndUpdate(ctx context.Context) {
	u.mu.Lock()
	defer u.mu.Unlock()

	u.logger.Debug("checking for updates")

	release, err := u.fetchLatestRelease(ctx)
	if err != nil {
		u.logger.Warn("failed to check for updates", zap.Error(err))
		return
	}

	if !isNewer(release.TagName, u.currentVersion) {
		u.logger.Debug("already up to date",
			zap.String("current", u.currentVersion),
			zap.String("latest", release.TagName),
		)
		return
	}

	u.logger.Info("new version available",
		zap.String("current", u.currentVersion),
		zap.String("latest", release.TagName),
	)

	if err := u.performUpdate(ctx, release); err != nil {
		u.logger.Error("update failed", zap.Error(err))
		return
	}
}

func (u *Updater) fetchLatestRelease(ctx context.Context) (*githubRelease, error) {
	url := fmt.Sprintf("%s/repos/%s/%s/releases/latest", githubAPIBase, u.repoOwner, u.repoName)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := u.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch release: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github API returned status %d", resp.StatusCode)
	}

	var release githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return &release, nil
}

func (u *Updater) performUpdate(ctx context.Context, release *githubRelease) error {
	// Determine the expected binary name for this platform.
	binaryName := binaryNameForPlatform(runtime.GOOS, runtime.GOARCH)

	// Find the binary asset and checksums asset.
	var binaryURL, checksumsURL string
	for _, asset := range release.Assets {
		switch asset.Name {
		case binaryName:
			binaryURL = asset.BrowserDownloadURL
		case checksumFile:
			checksumsURL = asset.BrowserDownloadURL
		}
	}

	if binaryURL == "" {
		return fmt.Errorf("no binary found for %s/%s in release %s", runtime.GOOS, runtime.GOARCH, release.TagName)
	}
	if checksumsURL == "" {
		return fmt.Errorf("no checksums file found in release %s", release.TagName)
	}

	// Download checksums first.
	expectedChecksum, err := u.fetchExpectedChecksum(ctx, checksumsURL, binaryName)
	if err != nil {
		return fmt.Errorf("fetch checksums: %w", err)
	}

	// Download the new binary to a temp file in the same directory as the
	// current binary so that os.Rename works (same filesystem).
	execPath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("get executable path: %w", err)
	}
	execPath, err = filepath.EvalSymlinks(execPath)
	if err != nil {
		return fmt.Errorf("resolve symlinks: %w", err)
	}

	tmpFile := filepath.Join(filepath.Dir(execPath), fmt.Sprintf(".vitalis-agent-update-%d", time.Now().UnixNano()))

	u.logger.Info("downloading update",
		zap.String("version", release.TagName),
		zap.String("url", binaryURL),
	)

	if err := u.downloadFile(ctx, binaryURL, tmpFile); err != nil {
		os.Remove(tmpFile)
		return fmt.Errorf("download binary: %w", err)
	}

	// Verify checksum.
	actualChecksum, err := fileChecksum(tmpFile)
	if err != nil {
		os.Remove(tmpFile)
		return fmt.Errorf("compute checksum: %w", err)
	}

	if actualChecksum != expectedChecksum {
		os.Remove(tmpFile)
		return fmt.Errorf("checksum mismatch: expected %s, got %s", expectedChecksum, actualChecksum)
	}

	u.logger.Info("checksum verified", zap.String("sha256", actualChecksum))

	// Perform the platform-specific binary replacement and restart.
	if err := u.applyUpdate(tmpFile, execPath); err != nil {
		os.Remove(tmpFile)
		return fmt.Errorf("apply update: %w", err)
	}

	u.logger.Info("update applied successfully, restarting...",
		zap.String("new_version", release.TagName),
	)

	return nil
}

func (u *Updater) fetchExpectedChecksum(ctx context.Context, checksumsURL, binaryName string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, checksumsURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", userAgent)

	resp, err := u.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("failed to download checksums: status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	// Parse checksums.txt format: "<hash>  <filename>" (two spaces, sha256sum format).
	for _, line := range strings.Split(string(body), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) == 2 && parts[1] == binaryName {
			return parts[0], nil
		}
	}

	return "", fmt.Errorf("checksum not found for %s", binaryName)
}

func (u *Updater) downloadFile(ctx context.Context, url, destPath string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", userAgent)

	resp, err := u.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed: status %d", resp.StatusCode)
	}

	out, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	return err
}

// binaryNameForPlatform returns the expected release asset name.
func binaryNameForPlatform(goos, goarch string) string {
	name := fmt.Sprintf("vitalis-agent-%s-%s", goos, goarch)
	if goos == "windows" {
		name += ".exe"
	}
	return name
}

// fileChecksum computes the SHA-256 checksum of a file.
func fileChecksum(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}

	return hex.EncodeToString(h.Sum(nil)), nil
}

// isNewer compares two version strings in v{N} format.
// Returns true if latest has a higher number than current.
func isNewer(latest, current string) bool {
	latestNum := parseVersionNumber(latest)
	currentNum := parseVersionNumber(current)
	if latestNum <= 0 || currentNum <= 0 {
		return false
	}
	return latestNum > currentNum
}

// parseVersionNumber extracts the integer from a version string like "v42" or "42".
func parseVersionNumber(v string) int {
	v = strings.TrimPrefix(v, "v")
	var n int
	if _, err := fmt.Sscanf(v, "%d", &n); err != nil {
		return 0
	}
	return n
}
