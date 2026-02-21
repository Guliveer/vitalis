#!/usr/bin/env bash
# =============================================================================
# Vitalis Agent — Build Downloadable Binaries
# =============================================================================
# Cross-compiles the agent for all supported platforms using the generic config
# and places the binaries in web/public/downloads/ for the download API.
#
# Usage:
#   ./build-downloads.sh                    # Auto-detect version from git tag
#   ./build-downloads.sh --version 1.2.3    # Set explicit version
#
# Output:
#   web/public/downloads/vitalis-agent-windows-amd64.exe
#   web/public/downloads/vitalis-agent-linux-amd64
#   web/public/downloads/vitalis-agent-darwin-arm64
#   web/public/downloads/vitalis-agent-darwin-amd64
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="${SCRIPT_DIR}/agent"
OUTPUT_DIR="${SCRIPT_DIR}/web/public/downloads"
EMBED_CONFIG="${AGENT_DIR}/cmd/agent/embed_config.yaml"
GENERIC_CONFIG="${AGENT_DIR}/configs/generic.yaml"
MODULE="./cmd/agent/"
BINARY_PREFIX="vitalis-agent"

# Platforms: os/arch/extension
PLATFORMS=(
  "windows/amd64/.exe"
  "linux/amd64/"
  "darwin/arm64/"
  "darwin/amd64/"
)

# ---------------------------------------------------------------------------
# Colors (disabled when stdout is not a terminal)
# ---------------------------------------------------------------------------
if [[ -t 1 ]]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  BLUE='\033[0;34m'
  CYAN='\033[0;36m'
  BOLD='\033[1m'
  RESET='\033[0m'
else
  RED='' GREEN='' YELLOW='' BLUE='' CYAN='' BOLD='' RESET=''
fi

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------
info()    { echo -e "${BLUE}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; }

# ---------------------------------------------------------------------------
# Cleanup handler — always remove staged embed_config.yaml
# ---------------------------------------------------------------------------
cleanup() {
  if [[ -f "${EMBED_CONFIG}" ]]; then
    rm -f "${EMBED_CONFIG}"
    info "Cleaned up staged embed_config.yaml"
  fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
VERSION=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      if [[ -z "${2:-}" ]]; then
        error "--version requires an argument"
        exit 1
      fi
      VERSION="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 [--version <version>]"
      echo ""
      echo "Cross-compiles the Vitalis agent for all supported platforms"
      echo "using the generic config and places binaries in web/public/downloads/."
      echo ""
      echo "Options:"
      echo "  --version <version>  Set the version string (default: git tag or 'dev')"
      echo "  --help               Show this help message"
      exit 0
      ;;
    *)
      error "Unknown option: $1"
      echo "Usage: $0 [--version <version>]"
      exit 1
      ;;
  esac
done

# Auto-detect version from git tags if not provided
if [[ -z "${VERSION}" ]]; then
  VERSION="$(git tag -l 'v[0-9]*' | grep -E '^v[0-9]+$' | sed 's/v//' | sort -n | tail -1)"
  if [[ -z "${VERSION}" ]]; then
    VERSION="dev"
  else
    VERSION="v${VERSION}"
  fi
fi

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
if ! command -v go &>/dev/null; then
  error "Go is not installed or not in PATH. Please install Go first."
  exit 1
fi

if [[ ! -f "${AGENT_DIR}/go.mod" ]]; then
  error "Agent source not found at ${AGENT_DIR}/go.mod"
  exit 1
fi

if [[ ! -f "${GENERIC_CONFIG}" ]]; then
  error "Generic config not found at ${GENERIC_CONFIG}"
  exit 1
fi

info "Go version: $(go version)"
info "Version tag: ${BOLD}${VERSION}${RESET}"
info "Output dir:  ${OUTPUT_DIR}"
echo ""

# ---------------------------------------------------------------------------
# Stage the generic config for go:embed
# ---------------------------------------------------------------------------
cp "${GENERIC_CONFIG}" "${EMBED_CONFIG}"
success "Staged generic config → agent/cmd/agent/embed_config.yaml"

# ---------------------------------------------------------------------------
# Create output directory
# ---------------------------------------------------------------------------
mkdir -p "${OUTPUT_DIR}"

# ---------------------------------------------------------------------------
# Build each platform
# ---------------------------------------------------------------------------
BUILT=()
FAILED=()

for platform in "${PLATFORMS[@]}"; do
  IFS='/' read -r os arch ext <<< "${platform}"
  output_name="${BINARY_PREFIX}-${os}-${arch}${ext}"
  output_path="${OUTPUT_DIR}/${output_name}"

  info "Building ${BOLD}${os}/${arch}${RESET}..."

  if (cd "${AGENT_DIR}" && \
      CGO_ENABLED=0 GOOS="${os}" GOARCH="${arch}" go build \
        -ldflags "-s -w -X main.version=${VERSION}" \
        -o "${output_path}" \
        ${MODULE}); then
    size="$(du -h "${output_path}" | cut -f1 | xargs)"
    success "Built ${output_name} (${size})"
    BUILT+=("${os}/${arch}")
  else
    error "Failed to build ${os}/${arch}"
    FAILED+=("${os}/${arch}")
  fi
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD} Download Binaries Build Summary${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "Version: ${CYAN}${VERSION}${RESET}"
echo -e "Config:  ${CYAN}generic${RESET} (${GENERIC_CONFIG})"
echo ""

if [[ ${#BUILT[@]} -gt 0 ]]; then
  echo -e "${GREEN}✓ Succeeded (${#BUILT[@]}):${RESET}"
  for p in "${BUILT[@]}"; do
    os="${p%/*}"
    arch="${p#*/}"
    ext=""
    [[ "${os}" == "windows" ]] && ext=".exe"
    name="${BINARY_PREFIX}-${os}-${arch}${ext}"
    size="$(du -h "${OUTPUT_DIR}/${name}" | cut -f1 | xargs)"
    echo -e "  ${GREEN}•${RESET} ${p} → ${name} (${size})"
  done
fi

if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo ""
  echo -e "${RED}✗ Failed (${#FAILED[@]}):${RESET}"
  for p in "${FAILED[@]}"; do
    echo -e "  ${RED}•${RESET} ${p}"
  done
fi

echo ""
echo -e "Output directory: ${CYAN}${OUTPUT_DIR}/${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

# Exit with error if any builds failed
if [[ ${#FAILED[@]} -gt 0 ]]; then
  exit 1
fi
