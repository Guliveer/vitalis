#!/usr/bin/env bash
# =============================================================================
# Vitalis Agent - Cross-Platform Build Script (macOS/Linux)
# =============================================================================
# Builds the Vitalis agent for one or more target platforms.
#
# Usage:
#   ./build.sh                        # Build for current platform (interactive config)
#   ./build.sh --config agent_z370m   # Build with a specific config
#   ./build.sh --all                  # Build for all supported platforms
#   ./build.sh --platform linux/amd64 # Build for a specific platform
#   ./build.sh --version 1.2.3        # Set version string
#   ./build.sh --clean                # Remove build artifacts
#   ./build.sh --help                 # Show help
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="${SCRIPT_DIR}/agent"
BUILD_DIR="${SCRIPT_DIR}/build"
CONFIGS_DIR="${SCRIPT_DIR}/agent/configs"
EMBED_CONFIG="${SCRIPT_DIR}/agent/cmd/agent/embed_config.yaml"
MODULE="./cmd/agent/"
BINARY_PREFIX="vitalis-agent"

# Supported platforms (os/arch)
SUPPORTED_PLATFORMS=(
  "windows/amd64"
  "linux/amd64"
  "darwin/arm64"
  "darwin/amd64"
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
# Usage / Help
# ---------------------------------------------------------------------------
show_help() {
  cat <<EOF
${BOLD}Vitalis Agent Build Script${RESET}

${CYAN}Usage:${RESET}
  ./build.sh [options]

${CYAN}Options:${RESET}
  --config <name>        Config to embed (name without .yaml extension from agent/configs/)
                         If omitted, an interactive picker is shown
  --platform <os/arch>   Build for a specific platform (e.g., linux/amd64)
  --version <version>    Set the version string embedded in the binary (default: dev)
  --all                  Build for all supported platforms
  --clean                Remove the build/ directory and staged embed_config.yaml, then exit
  --help                 Show this help message

${CYAN}Supported platforms:${RESET}
  windows/amd64          Windows 64-bit (Intel/AMD)
  linux/amd64            Linux 64-bit (Intel/AMD)
  darwin/arm64           macOS Apple Silicon (M1/M2/M3/M4)
  darwin/amd64           macOS Intel

${CYAN}Examples:${RESET}
  ./build.sh                              # Build for current OS/arch (interactive config)
  ./build.sh --config agent_z370m         # Build with specific config embedded
  ./build.sh --all --version 1.0.0        # Build all platforms with version
  ./build.sh --platform windows/amd64     # Cross-compile for Windows
  ./build.sh --clean                      # Clean build artifacts
EOF
}

# ---------------------------------------------------------------------------
# Determine the output binary name for a given os/arch
# ---------------------------------------------------------------------------
binary_name() {
  local os="$1"
  local arch="$2"
  local name="${BINARY_PREFIX}-${os}-${arch}"
  if [[ "${os}" == "windows" ]]; then
    name="${name}.exe"
  fi
  echo "${name}"
}

# ---------------------------------------------------------------------------
# Build a single platform
# ---------------------------------------------------------------------------
build_platform() {
  local os="$1"
  local arch="$2"
  local version="$3"
  local output
  output="$(binary_name "${os}" "${arch}")"
  local output_path="${BUILD_DIR}/${output}"

  info "Building ${BOLD}${os}/${arch}${RESET} → ${output}"

  # Run go build from the agent directory, outputting to ../build/
  if (cd "${AGENT_DIR}" && \
      GOOS="${os}" GOARCH="${arch}" go build \
        -ldflags "-s -w -X main.version=${version}" \
        -o "${output_path}" \
        ${MODULE}); then
    success "Built ${output} ($(du -h "${output_path}" | cut -f1 | xargs))"
    return 0
  else
    error "Failed to build ${os}/${arch}"
    return 1
  fi
}

# ---------------------------------------------------------------------------
# Create a convenience symlink/copy for the current-platform binary
# ---------------------------------------------------------------------------
create_convenience_link() {
  local os="$1"
  local arch="$2"
  local source
  source="$(binary_name "${os}" "${arch}")"
  local link_name="${BINARY_PREFIX}"
  if [[ "${os}" == "windows" ]]; then
    link_name="${link_name}.exe"
  fi

  local source_path="${BUILD_DIR}/${source}"
  local link_path="${BUILD_DIR}/${link_name}"

  # Remove existing link/file
  rm -f "${link_path}"

  # Create a relative symlink
  ln -s "${source}" "${link_path}" 2>/dev/null || cp "${source_path}" "${link_path}"
  info "Created convenience link: ${link_name} → ${source}"
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
VERSION=""
PLATFORM=""
CONFIG=""
BUILD_ALL=false
CLEAN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config)
      if [[ -z "${2:-}" ]]; then
        error "--config requires an argument (config name without .yaml extension)"
        exit 1
      fi
      CONFIG="$2"
      shift 2
      ;;
    --platform)
      if [[ -z "${2:-}" ]]; then
        error "--platform requires an argument (e.g., linux/amd64)"
        exit 1
      fi
      PLATFORM="$2"
      shift 2
      ;;
    --version)
      if [[ -z "${2:-}" ]]; then
        error "--version requires an argument"
        exit 1
      fi
      VERSION="$2"
      shift 2
      ;;
    --all)
      BUILD_ALL=true
      shift
      ;;
    --clean)
      CLEAN=true
      shift
      ;;
    --help|-h)
      show_help
      exit 0
      ;;
    *)
      error "Unknown option: $1"
      echo ""
      show_help
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Clean mode
# ---------------------------------------------------------------------------
if [[ "${CLEAN}" == true ]]; then
  if [[ -d "${BUILD_DIR}" ]]; then
    rm -rf "${BUILD_DIR}"
    success "Removed build/ directory"
  else
    info "build/ directory does not exist — nothing to clean"
  fi
  if [[ -f "${EMBED_CONFIG}" ]]; then
    rm -f "${EMBED_CONFIG}"
    success "Removed staged embed_config.yaml"
  fi
  exit 0
fi

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
  error "Visit https://go.dev/dl/ for installation instructions."
  exit 1
fi

if [[ ! -f "${AGENT_DIR}/go.mod" ]]; then
  error "Agent source not found at ${AGENT_DIR}/go.mod"
  exit 1
fi

info "Go version: $(go version)"
info "Version tag: ${BOLD}${VERSION}${RESET}"
echo ""

# ---------------------------------------------------------------------------
# Config selection
# ---------------------------------------------------------------------------
select_config() {
  # Gather available config files
  local config_files=()
  local config_names=()

  if [[ ! -d "${CONFIGS_DIR}" ]]; then
    error "Configs directory not found: ${CONFIGS_DIR}"
    exit 1
  fi

  for f in "${CONFIGS_DIR}"/*.yaml; do
    [[ -e "${f}" ]] || continue
    config_files+=("${f}")
    local base
    base="$(basename "${f}" .yaml)"
    config_names+=("${base}")
  done

  if [[ ${#config_files[@]} -eq 0 ]]; then
    error "No .yaml config files found in ${CONFIGS_DIR}"
    exit 1
  fi

  if [[ -n "${CONFIG}" ]]; then
    # Validate the provided config name
    local config_path="${CONFIGS_DIR}/${CONFIG}.yaml"
    if [[ ! -f "${config_path}" ]]; then
      error "Config file not found: ${config_path}"
      echo ""
      info "Available configs:"
      for name in "${config_names[@]}"; do
        echo "  - ${name}"
      done
      exit 1
    fi
    SELECTED_CONFIG_NAME="${CONFIG}"
    SELECTED_CONFIG_PATH="${config_path}"
  else
    # Interactive selection
    echo -e "${CYAN}Available configurations:${RESET}"
    local i=1
    for name in "${config_names[@]}"; do
      echo "  ${i}) ${name}"
      ((i++))
    done
    echo ""

    local selection
    read -p "Select configuration [1-${#config_names[@]}]: " selection

    # Validate selection is a number
    if ! [[ "${selection}" =~ ^[0-9]+$ ]]; then
      error "Invalid selection: '${selection}' — expected a number"
      exit 1
    fi

    if [[ "${selection}" -lt 1 || "${selection}" -gt ${#config_names[@]} ]]; then
      error "Selection out of range: ${selection} (valid: 1-${#config_names[@]})"
      exit 1
    fi

    local idx=$((selection - 1))
    SELECTED_CONFIG_NAME="${config_names[${idx}]}"
    SELECTED_CONFIG_PATH="${config_files[${idx}]}"
  fi
}

select_config

info "Using config: ${BOLD}${SELECTED_CONFIG_NAME}${RESET} (${SELECTED_CONFIG_PATH})"

# Stage the config for go:embed
cp "${SELECTED_CONFIG_PATH}" "${EMBED_CONFIG}"
success "Staged config → agent/cmd/agent/embed_config.yaml"
echo ""

# ---------------------------------------------------------------------------
# Create build directory
# ---------------------------------------------------------------------------
mkdir -p "${BUILD_DIR}"

# ---------------------------------------------------------------------------
# Determine what to build
# ---------------------------------------------------------------------------
BUILT=()
FAILED=()

if [[ "${BUILD_ALL}" == true ]]; then
  # Build all supported platforms
  info "Building for ${BOLD}all supported platforms${RESET}..."
  echo ""
  for platform in "${SUPPORTED_PLATFORMS[@]}"; do
    os="${platform%/*}"
    arch="${platform#*/}"
    if build_platform "${os}" "${arch}" "${VERSION}"; then
      BUILT+=("${platform}")
    else
      FAILED+=("${platform}")
    fi
  done

elif [[ -n "${PLATFORM}" ]]; then
  # Build for a specific platform
  os="${PLATFORM%/*}"
  arch="${PLATFORM#*/}"

  # Validate the platform
  valid=false
  for supported in "${SUPPORTED_PLATFORMS[@]}"; do
    if [[ "${supported}" == "${PLATFORM}" ]]; then
      valid=true
      break
    fi
  done

  if [[ "${valid}" == false ]]; then
    error "Unsupported platform: ${PLATFORM}"
    echo ""
    info "Supported platforms:"
    for p in "${SUPPORTED_PLATFORMS[@]}"; do
      echo "  - ${p}"
    done
    exit 1
  fi

  if build_platform "${os}" "${arch}" "${VERSION}"; then
    BUILT+=("${PLATFORM}")
  else
    FAILED+=("${PLATFORM}")
  fi

else
  # Build for current platform only
  CURRENT_OS="$(go env GOOS)"
  CURRENT_ARCH="$(go env GOARCH)"
  CURRENT_PLATFORM="${CURRENT_OS}/${CURRENT_ARCH}"

  info "Building for current platform: ${BOLD}${CURRENT_PLATFORM}${RESET}"
  echo ""

  if build_platform "${CURRENT_OS}" "${CURRENT_ARCH}" "${VERSION}"; then
    BUILT+=("${CURRENT_PLATFORM}")
    create_convenience_link "${CURRENT_OS}" "${CURRENT_ARCH}"
  else
    FAILED+=("${CURRENT_PLATFORM}")
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD} Build Summary${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "Embedded config: ${CYAN}${SELECTED_CONFIG_NAME}${RESET} (${SELECTED_CONFIG_PATH})"

if [[ ${#BUILT[@]} -gt 0 ]]; then
  echo -e "${GREEN}✓ Succeeded (${#BUILT[@]}):${RESET}"
  for p in "${BUILT[@]}"; do
    os="${p%/*}"
    arch="${p#*/}"
    name="$(binary_name "${os}" "${arch}")"
    size="$(du -h "${BUILD_DIR}/${name}" | cut -f1 | xargs)"
    echo -e "  ${GREEN}•${RESET} ${p} → ${name} (${size})"
  done
fi

if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo -e "${RED}✗ Failed (${#FAILED[@]}):${RESET}"
  for p in "${FAILED[@]}"; do
    echo -e "  ${RED}•${RESET} ${p}"
  done
fi

echo ""
echo -e "Output directory: ${CYAN}${BUILD_DIR}/${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

# Exit with error if any builds failed
if [[ ${#FAILED[@]} -gt 0 ]]; then
  exit 1
fi
