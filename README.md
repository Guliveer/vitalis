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
- **Embedded Configuration** — Config is baked into the binary at build time; no external files needed
- **Auto-Install as Service** — Binary auto-registers as a system service on first run (Windows Service, systemd, launchd)
- **Real-Time Dashboard** — CPU, RAM, disk, network charts with live process tables
- **Offline Resilience** — Local SQLite buffer survives reboots and network outages
- **Multi-Resolution Data** — Raw (7 days), hourly (30 days), and daily (1 year) retention
- **Secure by Design** — JWT auth, bcrypt passwords, machine token authentication, HTTPS enforcement
- **Zero-Config Deployment** — Vercel + Neon free tiers for effortless hosting
- **Cross-Platform Agent Builds** — Compile for Windows, Linux, and macOS from a single codebase

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

For the full architecture document including database schema, security threat model, and scaling strategy, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

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

### 5. Configure the Agent

Edit [`agent/configs/agent.yaml`](agent/configs/agent.yaml) with your server URL and machine token:

```yaml
server:
  url: "http://localhost:3000"
  machine_token: "your-machine-token"
```

### 6. Build and Run the Agent

The build scripts embed the selected configuration into the binary and handle cross-compilation:

```bash
# Build for your current platform (interactive config selection)
./build.sh

# Build with a specific config
./build.sh --config agent

# Build for all supported platforms with a version tag
./build.sh --all --config agent --version 1.0.0

# Windows users (PowerShell)
.\build.ps1 -Config "agent" -All -Version "1.0.0"
```

Binaries are output to the `build/` directory. See [Building](#building) for full details.

Run the agent (it auto-installs as a system service on first run):

```bash
./build/vitalis-agent
```

### 7. Register Your First User

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
│   │   ├── buffer/                 # SQLite-backed offline buffer
│   │   ├── sender/                 # HTTP batch sender with retry logic
│   │   ├── config/                 # YAML + env var configuration
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
├── build.sh                        # Build script (macOS/Linux)
├── build.ps1                       # Build script (Windows PowerShell)
├── docs/                           # Project documentation
│   ├── ARCHITECTURE.md             # Full architecture document
│   ├── DEPLOYMENT.md               # Deployment guide
│   ├── API.md                      # API reference
│   └── AGENT.md                    # Agent documentation
├── .env.example                    # Environment variable template
└── README.md                       # This file
```

---

## Documentation

| Document                                       | Description                                       |
| ---------------------------------------------- | ------------------------------------------------- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design, database schema, scaling strategy  |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)     | Step-by-step production deployment guide          |
| [`docs/API.md`](docs/API.md)                   | Complete API reference for all endpoints          |
| [`docs/AGENT.md`](docs/AGENT.md)               | Agent configuration, collectors, and installation |

---

## License

This project is licensed under the [MIT License](LICENSE).
