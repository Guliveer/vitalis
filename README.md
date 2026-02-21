# Vitalis

**Personal system monitoring platform — collect, visualize, and analyze machine metrics in real time.**

![Go](https://img.shields.io/badge/Go-1.21+-00ADD8?logo=go&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=next.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?logo=postgresql&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Overview

Vitalis is a production-grade monitoring platform designed for individuals and small teams who want full visibility into their machines' health. A lightweight Go agent collects system metrics (CPU, RAM, disk, network, processes, temperature, uptime) and sends them to a Next.js web dashboard backed by Neon PostgreSQL.

### Who It's For

- Developers monitoring personal workstations and home servers
- Small teams tracking a handful of machines without enterprise overhead
- Anyone who wants a self-hosted, privacy-first alternative to cloud monitoring services

### Key Features

- **Lightweight Go Agent** — < 50 MB RAM, < 2% CPU, single binary with zero dependencies
- **Layered Configuration** — CLI flags, environment variables, YAML file, or embedded config (in that priority order)
- **One-Command Setup** — `./vitalis-agent --setup` installs, configures, and registers as a service
- **Auto-Install as Service** — Binary auto-registers as a system service on first run (Windows Service, systemd, launchd)
- **Auto-Update** — Optional automatic updates via GitHub Releases with SHA-256 checksum verification
- **Real-Time Dashboard** — CPU, RAM, disk, network charts with live process tables
- **Offline Resilience** — Local SQLite buffer survives reboots and network outages
- **Multi-Resolution Data** — Raw (7 days), hourly (30 days), and daily (1 year) retention
- **Secure by Design** — JWT auth, bcrypt passwords, machine token authentication, HTTPS enforcement
- **Zero-Config Deployment** — Vercel + Neon free tiers for effortless hosting
- **Cross-Platform Agent Builds** — Compile for Windows, Linux, and macOS from a single codebase
- **Automated Releases** — Push a semver tag to build, checksum, and publish binaries via GitHub Actions

---

## Architecture

```mermaid
graph LR
    subgraph Agent["Go Agent (per machine)"]
        Collectors
        Scheduler
        SQLiteBuffer["SQLite Buffer"]
        HTTPSender["HTTP Sender"]
    end

    subgraph Web["Next.js App (Vercel)"]
        APIRoutes["API Routes"]
        Dashboard["Dashboard (RSC)"]
        AuthMiddleware["Auth Middleware"]
    end

    subgraph DB["Neon PostgreSQL (Serverless)"]
        Tables["users, machines, metrics\nhourly, daily, processes"]
    end

    Agent -- "HTTPS + gzip\nAuthorization: Bearer" --> Web
    Web -- "200 / 401 / 429" --> Agent
    Web --> DB
```

---

## Tech Stack

| Layer      | Technology                                                                                                                                | Purpose                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Agent      | [Go 1.21+](https://go.dev/)                                                                                                               | System metric collection             |
| Agent Deps | [gopsutil](https://github.com/shirou/gopsutil), [zap](https://pkg.go.dev/go.uber.org/zap), [yaml.v3](https://pkg.go.dev/gopkg.in/yaml.v3) | OS metrics, logging, config          |
| Web App    | [Next.js 14](https://nextjs.org/) (App Router, React 19)                                                                                  | Dashboard + API routes               |
| Database   | [Neon PostgreSQL](https://neon.tech/) (serverless)                                                                                        | Persistent storage with auto-suspend |
| ORM        | [Drizzle ORM](https://orm.drizzle.team/)                                                                                                  | Type-safe database queries           |
| Auth       | [jose](https://github.com/panva/jose) + [bcryptjs](https://github.com/nicolo-ribaudo/bcrypt)                                              | JWT tokens + password hashing        |
| Validation | [Zod](https://zod.dev/)                                                                                                                   | Runtime schema validation            |
| Charts     | [Recharts](https://recharts.org/)                                                                                                         | SVG-based metric visualization       |
| Styling    | [Tailwind CSS 4](https://tailwindcss.com/)                                                                                                | Utility-first CSS                    |
| Hosting    | [Vercel](https://vercel.com/)                                                                                                             | Serverless deployment + cron         |

---

## Quick Start

### Prerequisites

- **Node.js 18+** and npm
- **Go 1.21+**
- **PostgreSQL** — [Neon](https://neon.tech/) account (free tier) or local PostgreSQL 13+
- **Git**

### 1. Clone the Repository

```bash
git clone https://github.com/Guliveer/vitalis.git
cd vitalis
```

### 2. Set Up the Database

Create a Neon project (or use a local PostgreSQL instance) and run the initial migration:

```bash
# Using psql with your Neon connection string:
psql "postgresql://user:password@host/dbname?sslmode=require" \
  -f web/src/lib/db/migrations/0000_initial.sql
```

### 3. Configure Environment Variables

```bash
cp .env.example web/.env.local
```

Edit [`web/.env.local`](.env.example) with your values:

```env
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
JWT_SECRET=<generate-with-openssl-rand-base64-32>
JWT_REFRESH_SECRET=<generate-a-different-secret>
CRON_SECRET=<generate-another-secret>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Generate secrets:

```bash
openssl rand -base64 32   # Run three times — one for each secret
```

### 4. Start the Web App

```bash
cd web
npm install
npm run dev
```

The dashboard is now running at `http://localhost:3000`.

### 5. Install the Agent

Download the latest binary from [GitHub Releases](https://github.com/Guliveer/vitalis/releases) for your platform, or build from source:

```bash
./build.sh --config agent
```

Run the setup wizard:

```bash
# Interactive setup (prompts for server URL, token, and install mode)
sudo ./build/vitalis-agent --setup

# Or non-interactive for automation
sudo ./vitalis-agent --setup --mode system --url https://your-app.vercel.app --token mtoken_your-token
```

The wizard will:

- Copy the binary to the appropriate system directory
- Create a configuration file
- Register and start a system service

For per-user installation (no root required):

```bash
./vitalis-agent --setup --mode user
```

### 6. Register Your First User

1. Open `http://localhost:3000/register`
2. Create an account — the **first user is automatically promoted to ADMIN**
3. Log in and create a machine from the dashboard
4. Copy the generated machine token into your [`agent.yaml`](agent/configs/agent.yaml) config
5. Restart the agent — metrics will begin appearing in the dashboard

---

## Building

Vitalis includes cross-platform build scripts ([`build.sh`](build.sh) for macOS/Linux and [`build.ps1`](build.ps1) for Windows) that handle **config embedding**, compilation, version embedding, and output organization.

The build scripts select a configuration from [`agent/configs/`](agent/configs/) and embed it into the binary using Go's `//go:embed` directive. Each binary is self-contained — no external config file is needed at runtime.

### Build for Current Platform

```bash
# Interactive config selection
./build.sh

# Or specify a config directly
./build.sh --config agent_z370m
```

This compiles the agent for your current OS and architecture, outputting the binary to `build/vitalis-agent`.

### Build All Platforms

```bash
./build.sh --all --config agent_z370m --version 1.0.0
```

Produces binaries for all supported platforms:

| Platform        | Output Binary                           |
| --------------- | --------------------------------------- |
| `windows/amd64` | `build/vitalis-agent-windows-amd64.exe` |
| `linux/amd64`   | `build/vitalis-agent-linux-amd64`       |
| `darwin/arm64`  | `build/vitalis-agent-darwin-arm64`      |
| `darwin/amd64`  | `build/vitalis-agent-darwin-amd64`      |

### Cross-Compile for a Specific Platform

```bash
./build.sh --platform windows/amd64 --config agent_z370m
```

### Windows Users (PowerShell)

```powershell
# Build for current platform (interactive config)
.\build.ps1

# Build with specific config
.\build.ps1 -Config "agent_z370m"

# Build all platforms with version
.\build.ps1 -Config "agent_z370m" -All -Version "1.0.0"

# Cross-compile for a specific platform
.\build.ps1 -Config "agent_z370m" -Platform "linux/amd64"

# Clean build artifacts
.\build.ps1 -Clean
```

### Clean Build Artifacts

```bash
./build.sh --clean
```

---

## Agent Configuration

The agent supports layered configuration with the following precedence (highest first):

| Source                | Example                                               |
| --------------------- | ----------------------------------------------------- |
| CLI flags             | `--url https://... --token mtoken_...`                |
| Environment variables | `SA_SERVER_URL`, `SA_MACHINE_TOKEN`, `SA_LOG_LEVEL`   |
| External YAML file    | `/etc/vitalis/agent.yaml` or `~/.vitalis/config.yaml` |
| Embedded config       | Baked in at build time via `build.sh`                 |
| Defaults              | `http://localhost:3000`, 15s interval                 |

### Configuration File Reference

```yaml
server:
  url: "https://your-app.vercel.app" # API server URL
  machine_token: "mtoken_your-token" # Machine authentication token

collection:
  interval: "15s" # How often to collect metrics
  batch_interval: "30s" # How often to send batches to the API
  top_processes: 10 # Number of top processes to track

buffer:
  max_size_mb: 50 # Max local buffer size for offline storage
  db_path: "/var/lib/vitalis" # Directory for buffer files

logging:
  level: "info" # Log level: debug, info, warn, error
  file: "" # Log file path (empty = stdout only)
```

### Auto-Update Configuration

The agent supports automatic updates from GitHub Releases. Auto-update is **disabled by default** and must be explicitly enabled:

```yaml
update:
  enabled: false # Set to true to enable auto-updates
  check_interval: "1h" # How often to check for new versions
  channel: "stable" # "stable" (releases only) or "beta" (includes pre-releases)
```

When enabled, the agent periodically checks GitHub Releases for a newer version, downloads the platform-appropriate binary, verifies its SHA-256 checksum against the published `checksums.txt`, replaces the current binary, and restarts the service. If any step fails, the agent automatically rolls back to the previous binary.

> **Note:** Dev builds (`version=dev`) skip auto-update entirely. The agent must be running as a system service for the automatic restart to work.

### Install Locations

| Mode                 | Binary                         | Config                    | Data                      |
| -------------------- | ------------------------------ | ------------------------- | ------------------------- |
| System (Linux/macOS) | `/opt/vitalis/vitalis-agent`   | `/etc/vitalis/agent.yaml` | `/var/lib/vitalis/`       |
| System (Windows)     | `C:\Program Files\Vitalis\`    | `%ProgramData%\Vitalis\`  | `%ProgramData%\Vitalis\`  |
| User (Linux/macOS)   | `~/.vitalis/bin/vitalis-agent` | `~/.vitalis/config.yaml`  | `~/.vitalis/data/`        |
| User (Windows)       | `%LOCALAPPDATA%\Vitalis\`      | `%LOCALAPPDATA%\Vitalis\` | `%LOCALAPPDATA%\Vitalis\` |

---

## Project Structure

```
vitalis/
├── agent/                          # Go monitoring agent
│   ├── cmd/agent/
│   │   ├── main.go                 # Entry point, CLI flags, autostart logic
│   │   ├── embed.go                # go:embed directive for config embedding
│   │   └── embed_config.yaml       # Staging file (gitignored, generated by build)
│   ├── configs/                    # Machine-specific YAML configs (selected at build time)
│   │   ├── agent.yaml              # Default / template configuration
│   │   └── agent_z370m.yaml        # Example machine-specific config
│   ├── internal/
│   │   ├── autostart/              # Cross-platform service auto-installation
│   │   ├── collector/              # Metric collectors (CPU, RAM, disk, etc.)
│   │   ├── scheduler/              # Tick-based collection scheduler
│   │   ├── setup/                  # Setup wizard and installation logic
│   │   ├── buffer/                 # SQLite-backed offline buffer
│   │   ├── sender/                 # HTTP batch sender with retry logic
│   │   ├── config/                 # YAML + env var configuration
│   │   ├── updater/                # Auto-update via GitHub Releases
│   │   ├── service/                # Windows service integration
│   │   ├── platform/               # OS abstraction layer
│   │   └── models/                 # Shared data types
│   ├── go.mod
│   └── go.sum
├── web/                            # Next.js 14 web application
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/             # Login & register pages
│   │   │   ├── (dashboard)/        # Dashboard & machine detail pages
│   │   │   └── api/                # API routes (auth, machines, ingest, admin)
│   │   ├── components/             # React components (UI, charts, dashboard)
│   │   ├── lib/
│   │   │   ├── auth/               # JWT, password hashing, middleware
│   │   │   ├── db/                 # Drizzle ORM schema, migrations
│   │   │   ├── validation/         # Zod schemas
│   │   │   └── utils/              # Rate limiting, response helpers
│   │   └── types/                  # TypeScript type definitions
│   ├── vercel.json                 # Cron job configuration
│   └── package.json
├── .github/workflows/
│   ├── build-agent.yml             # CI build on push to main
│   └── release.yml                 # Automated release on semver tag push
├── build.sh                        # Build script (macOS/Linux)
├── build.ps1                       # Build script (Windows PowerShell)
├── .env.example                    # Environment variable template
└── README.md                       # This file
```

---

## Releases

Vitalis uses an automated release workflow powered by GitHub Actions ([`.github/workflows/release.yml`](.github/workflows/release.yml)).

### Creating a Release

Push a semver-formatted tag to trigger the release pipeline:

```bash
git tag v1.0.0
git push origin v1.0.0
```

For pre-releases (beta channel), include a pre-release suffix:

```bash
git tag v1.1.0-beta.1
git push origin v1.1.0-beta.1
```

### What the Workflow Does

1. **Build** — Cross-compiles agent binaries for all platforms (linux/amd64, darwin/amd64, darwin/arm64, windows/amd64)
2. **Checksum** — Generates `checksums.txt` with SHA-256 hashes for all binaries
3. **Release** — Creates a GitHub Release with all binaries and checksums attached, with auto-generated release notes
4. **Update Downloads** — Commits the new binaries to `web/public/downloads/` for the download API (stable releases only)

Pre-releases (tags containing `-`) are automatically marked as pre-release on GitHub and are **not** committed to the downloads directory.

---

## License

This project is licensed under the [MIT License](LICENSE).
