# =============================================================================
# Vitalis Agent - Cross-Platform Build Script (Windows PowerShell)
# =============================================================================
# Builds the Vitalis agent for one or more target platforms.
#
# Usage:
#   .\build.ps1                              # Build for current platform (interactive config)
#   .\build.ps1 -Config "agent_z370m"        # Build with a specific config
#   .\build.ps1 -All                         # Build for all supported platforms
#   .\build.ps1 -Platform "windows/amd64"    # Build for a specific platform
#   .\build.ps1 -Version "1.2.3"             # Set version string
#   .\build.ps1 -Clean                       # Remove build artifacts
#   .\build.ps1 -Help                        # Show help
# =============================================================================

[CmdletBinding()]
param(
    [string]$Config = "",
    [string]$Platform = "",
    [string]$Version = "",
    [switch]$All,
    [switch]$Clean,
    [switch]$Help
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
$ScriptDir    = $PSScriptRoot
$AgentDir     = Join-Path $ScriptDir "agent"
$BuildDir     = Join-Path $ScriptDir "build"
$ConfigsDir   = Join-Path $ScriptDir "agent" "configs"
$EmbedConfig  = Join-Path $ScriptDir "agent" "cmd" "agent" "embed_config.yaml"
$Module       = "./cmd/agent/"
$BinaryPrefix = "vitalis-agent"

# Supported platforms (os/arch)
$SupportedPlatforms = @(
    "windows/amd64",
    "linux/amd64",
    "darwin/arm64",
    "darwin/amd64"
)

# ---------------------------------------------------------------------------
# Color helpers
# ---------------------------------------------------------------------------
function Write-Info    { param([string]$Message) Write-Host "[INFO]  $Message" -ForegroundColor Blue }
function Write-Success { param([string]$Message) Write-Host "[OK]    $Message" -ForegroundColor Green }
function Write-Warn    { param([string]$Message) Write-Host "[WARN]  $Message" -ForegroundColor Yellow }
function Write-Err     { param([string]$Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }

# ---------------------------------------------------------------------------
# Usage / Help
# ---------------------------------------------------------------------------
function Show-Help {
    Write-Host ""
    Write-Host "Vitalis Agent Build Script" -ForegroundColor White -NoNewline
    Write-Host ""
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Cyan
    Write-Host "  .\build.ps1 [options]"
    Write-Host ""
    Write-Host "Options:" -ForegroundColor Cyan
    Write-Host "  -Config <name>        Config to embed (name without .yaml extension from agent/configs/)"
    Write-Host "                        If omitted, an interactive picker is shown"
    Write-Host "  -Platform <os/arch>   Build for a specific platform (e.g., linux/amd64)"
    Write-Host "  -Version <version>    Set the version string embedded in the binary (default: dev)"
    Write-Host "  -All                  Build for all supported platforms"
    Write-Host "  -Clean                Remove the build/ directory and staged embed_config.yaml, then exit"
    Write-Host "  -Help                 Show this help message"
    Write-Host ""
    Write-Host "Supported platforms:" -ForegroundColor Cyan
    Write-Host "  windows/amd64          Windows 64-bit (Intel/AMD)"
    Write-Host "  linux/amd64            Linux 64-bit (Intel/AMD)"
    Write-Host "  darwin/arm64           macOS Apple Silicon (M1/M2/M3/M4)"
    Write-Host "  darwin/amd64           macOS Intel"
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Cyan
    Write-Host "  .\build.ps1                              # Build for current OS/arch (interactive config)"
    Write-Host "  .\build.ps1 -Config agent_z370m          # Build with specific config embedded"
    Write-Host "  .\build.ps1 -All -Version 1.0.0          # Build all platforms with version"
    Write-Host "  .\build.ps1 -Platform windows/amd64      # Cross-compile for Windows"
    Write-Host "  .\build.ps1 -Clean                       # Clean build artifacts"
    Write-Host ""
}

# ---------------------------------------------------------------------------
# Determine the output binary name for a given os/arch
# ---------------------------------------------------------------------------
function Get-BinaryName {
    param(
        [string]$Os,
        [string]$Arch
    )
    $name = "$BinaryPrefix-$Os-$Arch"
    if ($Os -eq "windows") {
        $name = "$name.exe"
    }
    return $name
}

# ---------------------------------------------------------------------------
# Build a single platform
# ---------------------------------------------------------------------------
function Build-Platform {
    param(
        [string]$Os,
        [string]$Arch,
        [string]$BuildVersion
    )

    $outputName = Get-BinaryName -Os $Os -Arch $Arch
    $outputPath = Join-Path $BuildDir $outputName

    Write-Info "Building $Os/$Arch -> $outputName"

    # Set environment variables for cross-compilation
    $env:GOOS   = $Os
    $env:GOARCH = $Arch

    # Run go build from the agent directory
    $originalDir = Get-Location
    try {
        Set-Location $AgentDir
        $ldflags = "-s -w -X main.version=$BuildVersion"
        & go build -ldflags $ldflags -o $outputPath $Module 2>&1

        if ($LASTEXITCODE -ne 0) {
            Write-Err "Failed to build $Os/$Arch"
            return $false
        }

        $fileSize = (Get-Item $outputPath).Length
        $sizeStr = if ($fileSize -ge 1MB) {
            "{0:N1} MB" -f ($fileSize / 1MB)
        } else {
            "{0:N0} KB" -f ($fileSize / 1KB)
        }
        Write-Success "Built $outputName ($sizeStr)"
        return $true
    }
    catch {
        Write-Err "Failed to build ${Os}/${Arch}: $_"
        return $false
    }
    finally {
        Set-Location $originalDir
        # Clean up environment variables
        Remove-Item Env:\GOOS   -ErrorAction SilentlyContinue
        Remove-Item Env:\GOARCH -ErrorAction SilentlyContinue
    }
}

# ---------------------------------------------------------------------------
# Create a convenience copy for the current-platform binary
# ---------------------------------------------------------------------------
function New-ConvenienceCopy {
    param(
        [string]$Os,
        [string]$Arch
    )

    $sourceName = Get-BinaryName -Os $Os -Arch $Arch
    $linkName   = $BinaryPrefix
    if ($Os -eq "windows") {
        $linkName = "$linkName.exe"
    }

    $sourcePath = Join-Path $BuildDir $sourceName
    $linkPath   = Join-Path $BuildDir $linkName

    # Remove existing file
    if (Test-Path $linkPath) {
        Remove-Item $linkPath -Force
    }

    Copy-Item -Path $sourcePath -Destination $linkPath
    Write-Info "Created convenience copy: $linkName -> $sourceName"
}

# ===========================================================================
# Main
# ===========================================================================

# Show help
if ($Help) {
    Show-Help
    exit 0
}

# Clean mode
if ($Clean) {
    if (Test-Path $BuildDir) {
        Remove-Item -Recurse -Force $BuildDir
        Write-Success "Removed build/ directory"
    }
    else {
        Write-Info "build/ directory does not exist - nothing to clean"
    }
    if (Test-Path $EmbedConfig) {
        Remove-Item -Force $EmbedConfig
        Write-Success "Removed staged embed_config.yaml"
    }
    exit 0
}

# Pre-flight checks: is Go installed?
$goCmd = Get-Command go -ErrorAction SilentlyContinue
if (-not $goCmd) {
    Write-Err "Go is not installed or not in PATH. Please install Go first."
    Write-Err "Visit https://go.dev/dl/ for installation instructions."
    exit 1
}

# Check agent source exists
if (-not (Test-Path (Join-Path $AgentDir "go.mod"))) {
    Write-Err "Agent source not found at $AgentDir\go.mod"
    exit 1
}

# Auto-detect version from git tags if not provided
if ($Version -eq "") {
    $LATEST = git tag -l 'v[0-9]*' | Where-Object { $_ -match '^v\d+$' } | ForEach-Object { [int]($_ -replace 'v','') } | Sort-Object | Select-Object -Last 1
    if ($LATEST) {
        $Version = "v$LATEST"
    } else {
        $Version = "dev"
    }
}

$goVersion = & go version
Write-Info "Go version: $goVersion"
Write-Info "Version tag: $Version"
Write-Host ""

# ---------------------------------------------------------------------------
# Config selection
# ---------------------------------------------------------------------------
$SelectedConfigName = ""
$SelectedConfigPath = ""

if (-not (Test-Path $ConfigsDir)) {
    Write-Err "Configs directory not found: $ConfigsDir"
    exit 1
}

$configFiles = Get-ChildItem -Path $ConfigsDir -Filter "*.yaml" -File
if ($configFiles.Count -eq 0) {
    Write-Err "No .yaml config files found in $ConfigsDir"
    exit 1
}

$configNames = $configFiles | ForEach-Object { $_.BaseName }

if ($Config -ne "") {
    # Validate the provided config name
    $configPath = Join-Path $ConfigsDir "$Config.yaml"
    if (-not (Test-Path $configPath)) {
        Write-Err "Config file not found: $configPath"
        Write-Host ""
        Write-Info "Available configs:"
        foreach ($name in $configNames) {
            Write-Host "  - $name"
        }
        exit 1
    }
    $SelectedConfigName = $Config
    $SelectedConfigPath = $configPath
}
else {
    # Interactive selection
    Write-Host "Available configurations:" -ForegroundColor Cyan
    for ($i = 0; $i -lt $configNames.Count; $i++) {
        Write-Host ("  {0}) {1}" -f ($i + 1), $configNames[$i])
    }
    Write-Host ""

    $selection = Read-Host "Select configuration [1-$($configNames.Count)]"

    # Validate selection is a number
    $selNum = 0
    if (-not [int]::TryParse($selection, [ref]$selNum)) {
        Write-Err "Invalid selection: '$selection' - expected a number"
        exit 1
    }

    if ($selNum -lt 1 -or $selNum -gt $configNames.Count) {
        Write-Err "Selection out of range: $selNum (valid: 1-$($configNames.Count))"
        exit 1
    }

    $idx = $selNum - 1
    $SelectedConfigName = $configNames[$idx]
    $SelectedConfigPath = $configFiles[$idx].FullName
}

Write-Info "Using config: $SelectedConfigName ($SelectedConfigPath)"

# Stage the config for go:embed
Copy-Item -Path $SelectedConfigPath -Destination $EmbedConfig -Force
Write-Success "Staged config -> agent/cmd/agent/embed_config.yaml"
Write-Host ""

# Create build directory
if (-not (Test-Path $BuildDir)) {
    New-Item -ItemType Directory -Path $BuildDir -Force | Out-Null
}

# ---------------------------------------------------------------------------
# Determine what to build
# ---------------------------------------------------------------------------
$built  = @()
$failed = @()

if ($All) {
    # Build all supported platforms
    Write-Info "Building for all supported platforms..."
    Write-Host ""

    foreach ($plat in $SupportedPlatforms) {
        $parts = $plat -split "/"
        $os    = $parts[0]
        $arch  = $parts[1]

        $result = Build-Platform -Os $os -Arch $arch -BuildVersion $Version
        if ($result) {
            $built += $plat
        }
        else {
            $failed += $plat
        }
    }
}
elseif ($Platform -ne "") {
    # Build for a specific platform
    $parts = $Platform -split "/"
    if ($parts.Count -ne 2) {
        Write-Err "Invalid platform format: '$Platform'. Expected format: os/arch (e.g., linux/amd64)"
        exit 1
    }
    $os   = $parts[0]
    $arch = $parts[1]

    # Validate the platform
    if ($SupportedPlatforms -notcontains $Platform) {
        Write-Err "Unsupported platform: $Platform"
        Write-Host ""
        Write-Info "Supported platforms:"
        foreach ($p in $SupportedPlatforms) {
            Write-Host "  - $p"
        }
        exit 1
    }

    $result = Build-Platform -Os $os -Arch $arch -BuildVersion $Version
    if ($result) {
        $built += $Platform
    }
    else {
        $failed += $Platform
    }
}
else {
    # Build for current platform only
    $currentOs   = & go env GOOS
    $currentArch = & go env GOARCH
    $currentPlat = "$currentOs/$currentArch"

    Write-Info "Building for current platform: $currentPlat"
    Write-Host ""

    $result = Build-Platform -Os $currentOs -Arch $currentArch -BuildVersion $Version
    if ($result) {
        $built += $currentPlat
        New-ConvenienceCopy -Os $currentOs -Arch $currentArch
    }
    else {
        $failed += $currentPlat
    }
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host ("=" * 44) -ForegroundColor White
Write-Host " Build Summary" -ForegroundColor White
Write-Host ("=" * 44) -ForegroundColor White
Write-Host "Embedded config: $SelectedConfigName ($SelectedConfigPath)" -ForegroundColor Cyan

if ($built.Count -gt 0) {
    Write-Host "Succeeded ($($built.Count)):" -ForegroundColor Green
    foreach ($p in $built) {
        $parts = $p -split "/"
        $name  = Get-BinaryName -Os $parts[0] -Arch $parts[1]
        $filePath = Join-Path $BuildDir $name
        $fileSize = (Get-Item $filePath).Length
        $sizeStr = if ($fileSize -ge 1MB) {
            "{0:N1} MB" -f ($fileSize / 1MB)
        } else {
            "{0:N0} KB" -f ($fileSize / 1KB)
        }
        Write-Host "  * $p -> $name ($sizeStr)" -ForegroundColor Green
    }
}

if ($failed.Count -gt 0) {
    Write-Host "Failed ($($failed.Count)):" -ForegroundColor Red
    foreach ($p in $failed) {
        Write-Host "  * $p" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Output directory: $BuildDir" -ForegroundColor Cyan
Write-Host ("=" * 44) -ForegroundColor White

# Exit with error if any builds failed
if ($failed.Count -gt 0) {
    exit 1
}
