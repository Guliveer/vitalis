# Vitalis — Architecture Document

> **Version:** 1.0.0  
> **Last Updated:** 2026-02-17  
> **Status:** Design Phase — Single Source of Truth

---

## Table of Contents

1. [Architecture Diagram](#1-architecture-diagram)
2. [Technology Justification](#2-technology-justification)
3. [Database Schema](#3-database-schema)
4. [Folder Structure](#4-folder-structure)
5. [Agent Architecture](#5-agent-architecture)
6. [Backend Architecture](#6-backend-architecture)
7. [Dashboard Architecture](#7-dashboard-architecture)
8. [Rate Limiting Strategy](#8-rate-limiting-strategy)
9. [Reliability Strategy](#9-reliability-strategy)
10. [Security Threat Model](#10-security-threat-model)
11. [Performance Considerations](#11-performance-considerations)
12. [Scaling Strategy](#12-scaling-strategy)
13. [Future Improvements](#13-future-improvements)
14. [Deployment Checklist](#14-deployment-checklist)

---

## 1. Architecture Diagram

### System Overview

```mermaid
graph TB
    subgraph Machines["MONITORED MACHINES"]
        subgraph M1["Machine 1"]
            A1["Go Agent\nCollectors / Scheduler\nBuffer / Sender"]
        end
        subgraph M2["Machine 2"]
            A2["Go Agent\nCollectors / Scheduler\nBuffer / Sender"]
        end
        subgraph MN["Machine N"]
            AN["Go Agent"]
        end
    end

    subgraph Vercel["VERCEL EDGE NETWORK"]
        subgraph NextApp["Next.js Application"]
            API["API Routes\nPOST /ingest\nGET /metrics\nPOST /auth/*\nCRUD /machines"]
            Auth["Auth Middleware\nJWT Validation\nRole Checks\nMachine Token Verification"]
            Dashboard["Dashboard SSR\nReact Server Components\nStreaming"]
        end
    end

    subgraph Neon["NEON POSTGRESQL"]
        Tables["users | machines | machine_access\nmetrics | process_snapshots\nmetrics_hourly | metrics_daily"]
        Features["Auto-suspend / Auto-scaling\nServerless Driver"]
    end

    A1 -- "HTTPS + gzip\nX-Machine-Token" --> API
    A2 -- "HTTPS + gzip\nX-Machine-Token" --> API
    AN -- "HTTPS + gzip\nX-Machine-Token" --> API
    API -- "Neon Serverless Driver\nWebSocket" --> Neon
```

### Authentication Flows

```mermaid
sequenceDiagram
    participant Agent as Go Agent
    participant API as API Route
    participant Browser
    participant Auth as Auth Route

    Note over Agent,API: AGENT AUTHENTICATION
    Agent->>API: POST /api/ingest (X-Machine-Token, gzipped JSON)
    API->>API: 1. Validate token<br/>2. Lookup machine<br/>3. Bulk insert
    API-->>Agent: 200 / 401 / 429 / 503

    Note over Browser,Auth: USER AUTHENTICATION
    Browser->>Auth: POST /api/auth/login (email + password)
    Auth->>Auth: 1. Zod validate<br/>2. bcrypt compare<br/>3. Issue JWT pair
    Auth-->>Browser: Set-Cookie: token=JWT (httpOnly, Secure, SameSite=Lax)
```

### Offline Buffering Flow

```mermaid
graph LR
    C[Collector] --> S[Scheduler]
    S --> B["Buffer (SQLite)"]
    B --> Sender
    Sender -->|"200 OK"| DB["API → DB\n(mark synced)"]
    Sender -->|"failure"| Retry["Retry w/ backoff\n1s, 2s, 4s...5min max"]
    Retry -->|"API recovers"| DB
    Retry -->|"still failing"| B
```

---

## 2. Technology Justification

### Go for the Agent

**Chosen over:** Python, Rust, C#/.NET, Node.js

| Factor        | Go                             | Alternatives                                         |
| ------------- | ------------------------------ | ---------------------------------------------------- |
| Binary size   | ~8MB static binary             | Python: needs runtime. Rust: similar. C#: needs .NET |
| Memory        | 10-30MB typical                | Python: 50-100MB. Node.js: 40-80MB                   |
| Cross-compile | `GOOS=windows GOARCH=amd64`    | Rust: possible but harder. C#: needs SDK             |
| Concurrency   | Goroutines, cheap and native   | Python: GIL. Node.js: single-threaded                |
| Windows svc   | `golang.org/x/sys/windows/svc` | C#: native but locks to .NET                         |
| Build speed   | Fast                           | Rust: slow compilation                               |

**Decision:** Go gives the best balance of low resource usage, trivial cross-compilation, native concurrency, and mature Windows service support. No runtime installation needed on target machines.

### Next.js 14 with App Router

**Chosen over:** Express + React SPA, Remix, SvelteKit, FastAPI + React

| Factor             | Next.js 14        | Alternatives                         |
| ------------------ | ----------------- | ------------------------------------ |
| API + Frontend     | Single deployment | Express + React: two deployments     |
| Server Components  | Native RSC        | Remix: similar but smaller ecosystem |
| Vercel integration | Zero-config       | Others: manual infra                 |
| Streaming          | Built-in Suspense | Express: manual                      |
| Middleware         | Edge middleware   | Express: no edge                     |

**Decision:** Next.js 14 App Router eliminates a separate backend. API routes handle ingestion, auth, and CRUD. RSC reduces client JS. Vercel deployment is zero-config. Minimizing operational complexity is paramount for a personal project.

### Neon PostgreSQL

**Chosen over:** Supabase, PlanetScale, Railway Postgres, Turso, MongoDB

| Factor             | Neon                      | Alternatives                         |
| ------------------ | ------------------------- | ------------------------------------ |
| Serverless driver  | Native WebSocket for edge | Supabase: REST adds latency          |
| Auto-suspend       | Scales to zero            | Railway: always-on, costs idle       |
| JSONB              | Full PostgreSQL           | PlanetScale: MySQL, no JSONB         |
| Connection pooling | Built-in serverless       | Supabase: pgBouncer, less integrated |
| Free tier          | 0.5GB storage             | Comparable                           |

**Decision:** Neon's serverless driver avoids cold-start connection overhead. JSONB handles variable-structure data. Auto-suspend means zero cost when idle.

### Vercel for Hosting

**Chosen over:** AWS Lambda, Cloudflare Workers, Railway, Fly.io

**Decision:** First-party Next.js host. Free tier (100K invocations, 100GB bandwidth) is sufficient for 1-2 machines. Zero operational overhead.

### Tailwind CSS

**Chosen over:** CSS Modules, styled-components, Chakra UI, Material UI

**Decision:** Utility-first with zero runtime cost. No CSS-in-JS overhead. Precise layout control for dashboards. shadcn/ui can be adopted later (Tailwind-native, copy-paste).

### JWT for Authentication

**Chosen over:** Session-based auth, OAuth only

**Decision:** Stateless — critical for serverless with no persistent memory. Short-lived access tokens (15 min) in httpOnly cookies. Refresh tokens (7 days) for silent renewal. No Redis needed.

### bcrypt for Password Hashing

**Chosen over:** Argon2, scrypt, PBKDF2

**Decision:** Battle-tested. `bcryptjs` is pure JS (no native bindings — works on Vercel serverless). Cost factor 12. Argon2 needs native bindings that complicate deployment.

### Zod for Validation

**Chosen over:** Joi, Yup, class-validator

**Decision:** TypeScript-first with type inference. One schema = runtime validation + TS types. ~13KB, tree-shakeable. First-class Next.js ecosystem support.

---

## 3. Database Schema

### Full SQL

```sql
-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'USER'
                    CHECK (role IN ('ADMIN', 'USER')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);

-- ============================================================
-- MACHINES
-- ============================================================
CREATE TABLE machines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    machine_token   TEXT NOT NULL UNIQUE,
    os              TEXT NOT NULL DEFAULT 'windows',
    arch            TEXT NOT NULL DEFAULT 'amd64',
    last_seen       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_machines_user_id ON machines (user_id);
CREATE INDEX idx_machines_token ON machines (machine_token);

-- ============================================================
-- MACHINE ACCESS (multi-user sharing)
-- ============================================================
CREATE TABLE machine_access (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id      UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission      TEXT NOT NULL DEFAULT 'VIEW'
                    CHECK (permission IN ('VIEW', 'MANAGE')),
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (machine_id, user_id)
);

CREATE INDEX idx_machine_access_user ON machine_access (user_id);
CREATE INDEX idx_machine_access_machine ON machine_access (machine_id);

-- ============================================================
-- METRICS
-- ============================================================
CREATE TABLE metrics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id      UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    timestamp       TIMESTAMPTZ NOT NULL,
    cpu_overall     REAL NOT NULL,
    cpu_cores       JSONB,
    ram_used        BIGINT NOT NULL,
    ram_total       BIGINT NOT NULL,
    disk_usage      JSONB,
    network_rx      BIGINT NOT NULL DEFAULT 0,
    network_tx      BIGINT NOT NULL DEFAULT 0,
    uptime_seconds  BIGINT NOT NULL DEFAULT 0,
    cpu_temp        REAL,
    gpu_temp        REAL
);

-- Primary query: metrics for machine X in time range Y
CREATE INDEX idx_metrics_machine_time
    ON metrics (machine_id, timestamp DESC);

-- Cleanup: delete metrics older than X
CREATE INDEX idx_metrics_timestamp ON metrics (timestamp);

-- ============================================================
-- PROCESS SNAPSHOTS
-- ============================================================
CREATE TABLE process_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_id       UUID NOT NULL REFERENCES metrics(id) ON DELETE CASCADE,
    processes       JSONB NOT NULL
);

CREATE INDEX idx_process_snapshots_metric
    ON process_snapshots (metric_id);

-- ============================================================
-- HOURLY AGGREGATES (30-day retention)
-- ============================================================
CREATE TABLE metrics_hourly (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id      UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    bucket          TIMESTAMPTZ NOT NULL,
    cpu_avg         REAL NOT NULL,
    cpu_max         REAL NOT NULL,
    cpu_min         REAL NOT NULL,
    ram_used_avg    BIGINT NOT NULL,
    ram_used_max    BIGINT NOT NULL,
    disk_usage_avg  JSONB,
    network_rx_sum  BIGINT NOT NULL DEFAULT 0,
    network_tx_sum  BIGINT NOT NULL DEFAULT 0,
    sample_count    INTEGER NOT NULL DEFAULT 0,
    UNIQUE (machine_id, bucket)
);

CREATE INDEX idx_metrics_hourly_machine_bucket
    ON metrics_hourly (machine_id, bucket DESC);

-- ============================================================
-- DAILY AGGREGATES (1-year retention)
-- ============================================================
CREATE TABLE metrics_daily (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id      UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    bucket          TIMESTAMPTZ NOT NULL,
    cpu_avg         REAL NOT NULL,
    cpu_max         REAL NOT NULL,
    cpu_min         REAL NOT NULL,
    ram_used_avg    BIGINT NOT NULL,
    ram_used_max    BIGINT NOT NULL,
    disk_usage_avg  JSONB,
    network_rx_sum  BIGINT NOT NULL DEFAULT 0,
    network_tx_sum  BIGINT NOT NULL DEFAULT 0,
    sample_count    INTEGER NOT NULL DEFAULT 0,
    UNIQUE (machine_id, bucket)
);

CREATE INDEX idx_metrics_daily_machine_bucket
    ON metrics_daily (machine_id, bucket DESC);
```

### JSONB Structure Examples

**cpu_cores:**

```json
[
  { "core": 0, "usage": 45.2 },
  { "core": 1, "usage": 32.1 },
  { "core": 2, "usage": 78.9 },
  { "core": 3, "usage": 12.4 }
]
```

**disk_usage:**

```json
[
  { "mount": "C:", "total": 512110190592, "used": 234881024000, "fs": "NTFS" },
  { "mount": "D:", "total": 1099511627776, "used": 549755813888, "fs": "NTFS" }
]
```

**processes:**

```json
[
  { "pid": 1234, "name": "chrome.exe", "cpu": 12.5, "ram": 524288000, "threads": 42 },
  { "pid": 5678, "name": "code.exe", "cpu": 8.3, "ram": 314572800, "threads": 28 }
]
```

### Schema Trade-offs

#### Single Metrics Table vs. Separated Tables

**Chosen: Single table.**

| Approach         | Pros                                                    | Cons                                             |
| ---------------- | ------------------------------------------------------- | ------------------------------------------------ |
| Single table     | One INSERT per cycle. One SELECT for dashboard. Simple. | Wide rows. NULLs for optional fields.            |
| Separated tables | Narrow rows. Independent evolution.                     | Multiple INSERTs per cycle. JOINs for dashboard. |
| EAV pattern      | Infinitely flexible.                                    | Terrible performance. No type safety.            |

**Justification:** The agent collects all metrics simultaneously. One INSERT is most efficient for both agent and DB. The dashboard displays all metrics together — one SELECT with no JOINs is optimal. Row width (~1KB) is not a concern at this scale.

#### JSONB vs. Structured Columns

**Chosen: JSONB for variable-structure data only.**

| Data           | Storage               | Why                                            |
| -------------- | --------------------- | ---------------------------------------------- |
| cpu_overall    | REAL column           | Always present, aggregated, queried            |
| cpu_cores      | JSONB                 | Variable core count per machine. Display-only. |
| ram_used/total | BIGINT columns        | Always present, aggregated                     |
| disk_usage     | JSONB                 | Variable disk count. Structure varies.         |
| network_rx/tx  | BIGINT columns        | Always present, aggregated                     |
| processes      | JSONB, separate table | Large (2-5KB). Only for current-state view.    |

**Key insight:** Process snapshots are separated because they are large and only needed for the current-state panel, not time-series charts. Keeping them out of the metrics table means time-range queries scan smaller rows.

---

## 4. Folder Structure

### Agent — Go

```
agent/
├── cmd/
│   └── agent/
│       └── main.go                  # Entry point, CLI flags, service registration
├── internal/
│   ├── collector/
│   │   ├── collector.go             # Collector interface definition
│   │   ├── cpu.go                   # CPU usage collector
│   │   ├── memory.go                # RAM usage collector
│   │   ├── disk.go                  # Disk usage collector
│   │   ├── network.go               # Network I/O collector
│   │   ├── process.go               # Process list collector
│   │   ├── temperature.go           # CPU/GPU temperature collector
│   │   ├── uptime.go                # System uptime collector
│   │   └── registry.go              # Collector registry
│   ├── scheduler/
│   │   ├── scheduler.go             # Tick-based collection scheduler
│   │   └── event.go                 # Metric event types
│   ├── buffer/
│   │   ├── buffer.go                # Buffer interface
│   │   ├── sqlite.go                # SQLite-backed persistent buffer
│   │   └── schema.sql               # Buffer database schema
│   ├── sender/
│   │   ├── sender.go                # HTTP batch sender
│   │   ├── batch.go                 # Batch assembly logic
│   │   ├── retry.go                 # Exponential backoff retry
│   │   └── compress.go              # Gzip compression
│   ├── config/
│   │   ├── config.go                # Configuration struct and loading
│   │   └── defaults.go              # Default values
│   ├── service/
│   │   ├── service_windows.go       # Windows service (build tag)
│   │   ├── service_stub.go          # No-op for non-Windows
│   │   └── install.go               # Service install/uninstall
│   └── platform/
│       ├── platform.go              # OS abstraction interface
│       ├── windows.go               # Windows implementations
│       └── stub.go                  # Stub for unsupported OS
├── configs/
│   └── agent.example.yaml           # Example config
├── go.mod
├── go.sum
├── Makefile
└── README.md
```

### Web — Next.js

```
web/
├── src/
│   ├── app/
│   │   ├── layout.tsx                    # Root layout
│   │   ├── page.tsx                      # Landing redirect
│   │   ├── (auth)/
│   │   │   ├── layout.tsx                # Auth layout
│   │   │   ├── login/page.tsx            # Login
│   │   │   └── register/page.tsx         # Register
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx                # Dashboard layout
│   │   │   ├── page.tsx                  # Machine list
│   │   │   ├── machines/
│   │   │   │   ├── page.tsx              # Machine management
│   │   │   │   ├── new/page.tsx          # Register machine
│   │   │   │   └── [machineId]/
│   │   │   │       ├── page.tsx          # Machine detail
│   │   │   │       ├── loading.tsx       # Streaming skeleton
│   │   │   │       └── settings/page.tsx # Machine settings
│   │   │   ├── settings/page.tsx         # User settings
│   │   │   └── admin/page.tsx            # Admin panel
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── login/route.ts
│   │       │   ├── register/route.ts
│   │       │   ├── refresh/route.ts
│   │       │   └── logout/route.ts
│   │       ├── machines/
│   │       │   ├── route.ts              # GET list, POST create
│   │       │   └── [machineId]/
│   │       │       ├── route.ts          # GET, PATCH, DELETE
│   │       │       ├── token/route.ts    # POST rotate token
│   │       │       ├── metrics/route.ts  # GET query metrics
│   │       │       └── access/route.ts   # GET, POST, DELETE
│   │       ├── ingest/route.ts           # POST agent ingestion
│   │       └── admin/cleanup/route.ts    # POST data cleanup
│   ├── lib/
│   │   ├── db/
│   │   │   ├── client.ts                # Neon client (lazy init)
│   │   │   ├── queries/
│   │   │   │   ├── users.ts
│   │   │   │   ├── machines.ts
│   │   │   │   ├── metrics.ts
│   │   │   │   └── access.ts
│   │   │   └── migrations/
│   │   │       └── 001_initial.sql
│   │   ├── auth/
│   │   │   ├── jwt.ts                   # JWT sign/verify
│   │   │   ├── password.ts              # bcrypt hash/compare
│   │   │   ├── middleware.ts            # Auth middleware
│   │   │   └── machine-auth.ts          # Machine token verify
│   │   └── validation/
│   │       ├── auth.ts                  # Auth schemas
│   │       ├── machines.ts              # Machine schemas
│   │       ├── metrics.ts               # Ingest schemas
│   │       └── common.ts               # Shared helpers
│   ├── components/
│   │   ├── ui/                          # Base UI components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── skeleton.tsx
│   │   │   └── dropdown.tsx
│   │   ├── charts/                      # Chart components
│   │   │   ├── cpu-chart.tsx
│   │   │   ├── ram-chart.tsx
│   │   │   ├── disk-chart.tsx
│   │   │   ├── network-chart.tsx
│   │   │   └── chart-wrapper.tsx
│   │   ├── dashboard/                   # Dashboard components
│   │   │   ├── machine-card.tsx
│   │   │   ├── machine-selector.tsx
│   │   │   ├── metric-panel.tsx
│   │   │   ├── process-table.tsx
│   │   │   └── status-indicator.tsx
│   │   ├── layout/                      # Layout components
│   │   │   ├── sidebar.tsx
│   │   │   ├── header.tsx
│   │   │   └── nav-links.tsx
│   │   └── auth/                        # Auth components
│   │       ├── login-form.tsx
│   │       └── register-form.tsx
│   └── types/
│       ├── api.ts
│       ├── metrics.ts
│       ├── machines.ts
│       └── auth.ts
├── public/favicon.ico
├── tailwind.config.ts
├── tsconfig.json
├── next.config.js
├── package.json
└── README.md
```

---

## 5. Agent Architecture

### Collector Interface

Every metric source implements a common interface, enabling new collectors without modifying the scheduler or sender:

```
type Collector interface {
    Name() string
    Collect(ctx context.Context) (interface{}, error)
    Interval() time.Duration
}
```

**Registered collectors:**

| Collector   | Data                    | Interval | Notes                        |
| ----------- | ----------------------- | -------- | ---------------------------- |
| CPU         | Overall %, per-core %   | 10s      | Uses gopsutil or WMI         |
| Memory      | Used bytes, total bytes | 10s      | Straightforward syscall      |
| Disk        | Per-mount usage         | 30s      | Less volatile                |
| Network     | RX/TX bytes delta       | 10s      | Computes delta between reads |
| Process     | Top 30 by CPU+RAM       | 30s      | Sorted, truncated            |
| Temperature | CPU temp, GPU temp      | 30s      | May need OpenHardwareMonitor |
| Uptime      | Seconds since boot      | 60s      | Rarely changes               |

### Collector Registry

Collectors self-register at init time. The scheduler queries the registry for all active collectors:

```
registry.Register(&CPUCollector{})
registry.Register(&MemoryCollector{})
```

Adding a new collector = one file with a self-registering `init()` function. No changes to existing code.

### Scheduler Pattern

```mermaid
graph TB
    Scheduler --> T10["Ticker 10s"]
    Scheduler --> T30["Ticker 30s"]
    Scheduler --> T60["Ticker 60s"]
    T10 --> CPU & Memory & Network
    T30 --> Disk & Process & Temperature
    T60 --> Uptime
    CPU & Memory & Network & Disk & Process & Temperature & Uptime --> ME["MetricEvent"]
    ME --> BW["Buffer.Write()"]
```

The scheduler does NOT send data. It only writes to the buffer. This decouples collection from transmission.

### Batch Sending Strategy

A separate Sender goroutine (default: 30-second timer):

1. Query buffer for unsent records (up to 60 per batch)
2. Serialize to JSON, gzip compress
3. POST to `/api/ingest` with `X-Machine-Token` header
4. **200 OK:** mark records as synced in buffer
5. **4xx:** log error, discard (bad data)
6. **5xx/timeout:** leave in buffer, retry next cycle
7. **Network error:** exponential backoff

### Local SQLite Buffer

```sql
CREATE TABLE buffer (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    payload     BLOB NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    synced      INTEGER NOT NULL DEFAULT 0,
    synced_at   TEXT
);
CREATE INDEX idx_buffer_unsynced ON buffer (synced, created_at);
```

**Why SQLite:** Survives crashes, reboots, Windows updates. No external dependency. Max 50MB (~50K events, ~6 days at 10s intervals). Auto-cleanup of synced records older than 24h.

### Exponential Backoff

```
Attempt 1: 1s    Attempt 4: 8s
Attempt 2: 2s    Attempt 5: 16s
Attempt 3: 4s    ...max: 5 minutes
Jitter: +/- 20% to prevent thundering herd
Reset: on successful send
```

### Graceful Shutdown

On SIGTERM, SIGINT, or Windows service stop:

1. Stop all collector tickers
2. Flush pending events to buffer
3. Attempt one final send (5s timeout)
4. Close SQLite cleanly
5. Exit code 0

### Windows Service

Using `golang.org/x/sys/windows/svc`:

- `agent.exe --install` — register with Windows SCM
- `agent.exe --uninstall` — remove service
- Started by SCM: enters service control loop
- Started from terminal: runs in foreground (debug mode)
- Build tags: `//go:build windows` for service code
- Config location: `%ProgramData%\Vitalis\agent.yaml`

### OS Abstraction Layer

```
type Platform interface {
    GetCPUUsage() (float64, []CoreUsage, error)
    GetMemoryInfo() (used int64, total int64, error)
    GetDiskUsage() ([]DiskInfo, error)
    GetNetworkStats() (rx int64, tx int64, error)
    GetProcessList(topN int) ([]ProcessInfo, error)
    GetTemperatures() (cpuTemp float64, gpuTemp float64, error)
    GetUptime() (int64, error)
}
```

Current: Windows only. Future: macOS (sysctl, IOKit), Linux (/proc, /sys).

### Resource Constraints

| Resource | Budget     | Strategy                                            |
| -------- | ---------- | --------------------------------------------------- |
| RAM      | < 50MB     | Bounded buffer, no large caches, streaming JSON     |
| CPU      | < 2% avg   | Collection is I/O-bound, goroutines yield naturally |
| Disk     | < 50MB     | SQLite with auto-cleanup                            |
| Network  | < 10KB/min | Gzip, batching, deltas for network counters         |

---

## 6. Backend Architecture

### Authentication Flow

**Registration:**

1. Zod validates email format + password (min 8 chars)
2. Check email uniqueness (409 if exists)
3. bcrypt hash (cost 12)
4. Insert user (first user gets ADMIN role)
5. Issue JWT access (15 min) + refresh (7 days) tokens
6. Set httpOnly, Secure, SameSite=Lax cookies

**Login:**

1. Zod validate input
2. Lookup by email (generic "invalid credentials" on miss)
3. bcrypt.compare
4. Issue token pair, set cookies

**Refresh:**

1. Verify refresh token from cookie
2. Issue new access token
3. Optionally rotate refresh token

**Logout:**

1. Clear cookies (Max-Age=0)

### JWT Structure

**Access token (15 min):** Contains `sub` (user UUID), `email`, `role`, `iat`, `exp`. Signed with HS256 using `JWT_SECRET` env var.

**Refresh token (7 days):** Contains `sub` (user UUID), `type: refresh`, `iat`, `exp`. Signed with separate `JWT_REFRESH_SECRET` env var.

Access and refresh tokens use different signing secrets to prevent cross-use.

### Role-Based Access Control

| Role  | Capabilities                                                                       |
| ----- | ---------------------------------------------------------------------------------- |
| ADMIN | All USER capabilities + manage all machines + manage users + cleanup + admin panel |
| USER  | Register machines + view own + view shared + manage owned machines                 |

**Machine permissions:**

- **Owner:** Full control (implicit MANAGE)
- **Shared VIEW:** See metrics and processes only
- **Shared MANAGE:** Modify settings, rotate token, share with others

**Access check on every route:**

1. Extract JWT from cookie, verify signature + expiry
2. Extract user ID and role
3. For machine routes: check owner OR machine_access OR ADMIN
4. Reject 403 if none match

### Machine Token Authentication

Machine tokens are opaque, cryptographically random strings (64 hex chars via `crypto.randomBytes(32)`). They are independent of user JWT auth.

**Ingestion flow:**

1. Agent sends `POST /api/ingest` with `X-Machine-Token` header
2. Query: `SELECT id FROM machines WHERE machine_token = $1`
3. Not found: 401 Unauthorized. Found: proceed with ingestion, update `last_seen`

**Token rotation:** Owner calls `POST /api/machines/:id/token`. New random token generated, old token immediately invalidated. Agent must be reconfigured.

### Metric Ingestion Endpoint Design

**`POST /api/ingest`**

- Headers: `X-Machine-Token`, `Content-Type: application/json`, `Content-Encoding: gzip`
- Body (decompressed): `{ "batch": [ ...metric objects... ] }`
- Responses: 200 (ingested), 400 (validation failed), 401 (bad token), 413 (payload > 1MB or > 100 items), 429 (rate limited), 503 (DB unreachable)

### Zod Validation

Every route validates with Zod before any DB interaction. The ingest schema validates: `timestamp` (ISO datetime), `cpu_overall` (0-100), `cpu_cores` (array, optional), `ram_used`/`ram_total` (positive int), `disk_usage` (array, optional), `network_rx`/`network_tx` (default 0), `uptime_seconds` (default 0), `cpu_temp`/`gpu_temp` (optional), `processes` (array, optional). Batch: min 1, max 100 items.

### Bulk Insert Strategy

1. Validate entire batch with Zod
2. Single multi-row INSERT for metrics table
3. Separate multi-row INSERT for process_snapshots (when present)
4. Execute both in a transaction
5. Update `machines.last_seen` to latest timestamp in batch

**Why multi-row INSERT:** 1 DB round-trip instead of N. Critical for serverless (~10ms latency per round-trip to Neon). 10 metrics: ~10ms vs ~100ms.

### Cold Start Optimization

1. **Lazy DB client:** Create Neon client on first use, cache in module scope (persists across warm invocations)
2. **Neon serverless driver:** WebSocket connections establish faster than TCP
3. **Minimal imports:** Only import what each route needs. No barrel exports.
4. **Edge runtime where possible:** Auth middleware on Edge Runtime (< 50ms cold start)

### CORS and CSRF Protection

- **CORS:** Not needed for same-origin dashboard. Agent ingestion is server-to-server (no browser involved).
- **CSRF:** httpOnly SameSite=Lax cookies prevent CSRF for GET. State-changing routes check Origin header matches deployment URL.
- **Agent requests:** Custom `X-Machine-Token` header cannot be set by browser CSRF attacks (requires CORS preflight which would fail).

---

## 7. Dashboard Architecture

### Pages

| Route                     | Page                             | Auth | Role               |
| ------------------------- | -------------------------------- | ---- | ------------------ |
| `/login`                  | Login form                       | No   | Any                |
| `/register`               | Registration form                | No   | Any                |
| `/`                       | Dashboard home with machine list | Yes  | Any                |
| `/machines`               | Machine management               | Yes  | Any                |
| `/machines/new`           | Register new machine             | Yes  | Any                |
| `/machines/[id]`          | Machine detail with charts       | Yes  | Owner/Shared/Admin |
| `/machines/[id]/settings` | Machine settings                 | Yes  | Owner/Admin        |
| `/settings`               | User profile                     | Yes  | Any                |
| `/admin`                  | Admin panel                      | Yes  | ADMIN              |

### Machine Detail View Layout

```mermaid
graph TB
    subgraph Header["Machine Header"]
        Name["Machine Name | Status: Online | Last seen: 2m ago"]
    end
    subgraph TimeRange["Time Range Selector"]
        TR["1h | 6h | 24h | 7d | 30d"]
    end
    subgraph Charts["Metric Charts"]
        CPU["CPU Usage Over Time\n(line chart: overall + cores)"]
        RAM["RAM Usage Over Time\n(area chart: used/total)"]
        DiskChart["Disk Usage\n(bar chart per disk)"]
        Net["Network I/O\n(dual line: RX/TX)"]
    end
    subgraph Current["Current State Panel"]
        CS["CPU 45% | RAM 8/16G | Temp 65C | Up 3d 4h"]
    end
    subgraph Processes["Process Table (sortable)"]
        PT["PID | Name | CPU% | RAM | Threads"]
    end

    Header --> TimeRange --> Charts --> Current --> Processes
```

### React Server Components Usage

| Component           | Rendering         | Rationale                     |
| ------------------- | ----------------- | ----------------------------- |
| Layout, sidebar     | Server Component  | Static, no interactivity      |
| Machine list        | Server Component  | Fetch on server, stream       |
| Machine detail page | Server + Suspense | Stream charts progressively   |
| Charts              | Client Component  | Needs browser canvas/SVG APIs |
| Process table       | Client Component  | Sortable, filterable          |
| Time range selector | Client Component  | Triggers refetch              |
| Auth forms          | Client Component  | Form state management         |

### Data Fetching Strategy

**Server-side (RSC):** Fetch on every request with `revalidate: 0` (no ISR caching for real-time data).

**Client-side:** Time range changes trigger `fetch()`. Manual `useState` + `useEffect` — no SWR or React Query to keep deps minimal. Polling every 30s for current machine view.

**Caching:** No CDN cache for API routes. `Cache-Control: no-store` for metrics. Static assets cached by Vercel CDN normally.

### Streaming

Machine detail uses Suspense boundaries per chart:

```
<Suspense fallback={<ChartSkeleton />}>
  <CPUChart machineId={id} range={range} />
</Suspense>
<Suspense fallback={<ChartSkeleton />}>
  <RAMChart machineId={id} range={range} />
</Suspense>
```

Each chart is an async Server Component fetching its own data. Page shell renders immediately; charts stream in as data arrives.

### Styling

- **Tailwind CSS only.** No component library.
- **Dark mode:** `class` strategy with toggle. Dashboard defaults to dark.
- **Responsive:** Mobile-first. Charts stack vertically on small screens.
- **Future:** shadcn/ui components can be copy-pasted as needed.

### Chart Library

**Chosen: Recharts**

| Library  | Size (gzip) | SSR         | Verdict                                              |
| -------- | ----------- | ----------- | ---------------------------------------------------- |
| Recharts | ~45KB       | Partial     | **Chosen** — best balance of size, API, and features |
| Chart.js | ~65KB       | No (canvas) | Heavier, canvas-only                                 |
| Visx     | ~20KB/chart | Yes (SVG)   | Too much boilerplate                                 |
| Nivo     | ~100KB+     | Yes         | Too heavy                                            |

**Why Recharts:** SVG-based (accessible, responsive), declarative React API, supports line/area/bar charts needed for metrics, works with Tailwind. Not the smallest, but best DX for the chart types needed.

---

## 8. Rate Limiting Strategy

### Per-Machine Rate Limiting

Each machine token has an independent rate limit to prevent one misconfigured agent from consuming the entire budget.

| Metric                 | Limit            | Rationale                                                               |
| ---------------------- | ---------------- | ----------------------------------------------------------------------- |
| Requests per minute    | 10               | Agent sends every 30-60s (2 req/min normal). 10 allows catch-up bursts. |
| Batch size per request | 100 items        | 60s of 10s-interval = 6 items. 100 allows large catch-up.               |
| Payload size           | 1MB uncompressed | 100 metrics with processes is ~50KB. 1MB is generous.                   |
| Requests per hour      | 200              | Sustained limit against runaway agents.                                 |

### Scaling from 1 to 20 Machines

| Machines | Req/min normal | Monthly invocations (60s interval) |
| -------- | -------------- | ---------------------------------- |
| 1        | 1              | ~43,200                            |
| 2        | 2              | ~86,400                            |
| 5        | 5              | ~216,000                           |
| 10       | 10             | ~432,000                           |
| 20       | 20             | ~864,000                           |

**Vercel free tier: 100K invocations/month.**

- 1 machine at 60s intervals: ~43K/month — fits comfortably
- 2 machines at 60s: ~86K + dashboard ~10K = ~96K — tight but fits
- 3+ machines: exceeds free tier, upgrade to Pro or increase interval

**Recommendation:** Default agent interval of 60 seconds. Dashboard adds ~5-10K invocations/month.

### Staying Within Vercel Free Tier

| Limit          | Free Tier      | Strategy                                      |
| -------------- | -------------- | --------------------------------------------- |
| Execution time | 10s/invocation | Bulk inserts < 2s. Queries with indexes < 1s. |
| Bandwidth      | 100GB/month    | Gzip on ingestion. Small JSON responses.      |
| Invocations    | 100K/month     | 60s agent interval. 1-2 machines.             |
| Function size  | 50MB           | Next.js bundles typically 5-15MB.             |

### Abuse Prevention

1. **Invalid token:** Immediate 401, no processing
2. **Oversized payload:** Reject before parsing via Content-Length check
3. **Too many requests:** 429 with Retry-After header
4. **Malformed data:** Zod rejects early, before DB interaction
5. **Replay attacks:** Reject timestamps > 1 hour in future or > 7 days in past

---

## 9. Reliability Strategy

### Failure Scenarios

#### Database Down

- API wraps DB operations in try/catch
- On connection failure: return 503 with `Retry-After: 30`
- Agent interprets 503 as "try later", keeps batch in buffer
- Dashboard shows "Database temporarily unavailable" banner

#### API Timeout

- Vercel kills functions after 10s
- Agent receives timeout/connection reset
- Data stays in buffer, retries next cycle with exponential backoff
- Mitigation: bulk inserts designed to complete in < 2s

#### Machine Offline for Hours

- Agent continues collecting to SQLite buffer (10s intervals)
- Buffer holds ~50K events (~6 days at 10s)
- On reconnect: catch-up sync sends buffered batches (60 records per batch)
- Server processes catch-up batches normally (timestamps are from collection time, not send time)
- 6 hours offline at 10s = ~2,160 events = ~36 catch-up batches = ~18 minutes to sync

#### Agent Crash

- SQLite buffer persists on disk
- On restart: unsent records still in buffer
- Sender picks up where it left off
- No data loss for any metrics written to buffer before crash

### Data Retention Policy

| Tier              | Granularity      | Retention | Storage estimate per machine |
| ----------------- | ---------------- | --------- | ---------------------------- |
| Raw metrics       | 10-60s intervals | 7 days    | ~60K rows, ~60MB             |
| Hourly aggregates | 1 hour           | 30 days   | ~720 rows, ~100KB            |
| Daily aggregates  | 1 day            | 1 year    | ~365 rows, ~50KB             |

### Aggregation Strategy

A cleanup/aggregation job runs via Vercel Cron (daily) or on-demand via `POST /api/admin/cleanup`:

1. **Aggregate:** For each machine, compute hourly rollups from raw metrics older than 7 days (AVG, MAX, MIN for CPU/RAM; SUM for network; AVG for disk JSONB)
2. **Insert** into `metrics_hourly` using `ON CONFLICT (machine_id, bucket) DO UPDATE` (idempotent)
3. **Delete** raw metrics older than 7 days
4. **Repeat** for daily aggregates from hourly data older than 30 days
5. **Delete** hourly aggregates older than 30 days
6. **Delete** daily aggregates older than 1 year

### Archival Strategy

For data beyond the 1-year daily retention:

- **Option A (recommended for now):** Simply delete. Personal monitoring rarely needs historical data beyond 1 year.
- **Option B (future):** Export to CSV/JSON and store in object storage (Vercel Blob, S3) before deletion.
- **Option C (future):** Compress and store in a separate `metrics_archive` table with lower query performance expectations.

---

## 10. Security Threat Model

### Threat: Agent Impersonation

**Attack:** Attacker obtains or guesses a machine token and sends fake metrics.

**Mitigations:**

- Tokens are 64 hex chars (256 bits of entropy) — not guessable
- Token rotation via `POST /api/machines/:id/token`
- Rate limiting prevents brute-force token discovery
- Monitor for anomalous `last_seen` patterns (machine reporting from unexpected IPs)

### Threat: Token Theft (User JWT)

**Attack:** XSS or network interception steals user session.

**Mitigations:**

- httpOnly cookies: JavaScript cannot read them (prevents XSS theft)
- Secure flag: only sent over HTTPS
- SameSite=Lax: prevents CSRF
- Short-lived access tokens (15 min): limits window of exploitation
- Refresh token rotation: old refresh tokens become invalid on use

### Threat: SQL Injection

**Attack:** Malicious input in API requests executes arbitrary SQL.

**Mitigations:**

- All queries use parameterized statements (`$1`, `$2` placeholders)
- Zod validation rejects unexpected input shapes before queries run
- No string concatenation in SQL construction
- Neon serverless driver uses prepared statements

### Threat: DDoS on Ingestion

**Attack:** Flood `/api/ingest` with requests to exhaust Vercel invocations or Neon compute.

**Mitigations:**

- Machine token required (unauthenticated requests rejected immediately)
- Rate limiting per machine token (10 req/min, 200 req/hour)
- Payload size limit (1MB, enforced before parsing)
- Batch size limit (100 items max)
- Vercel's built-in DDoS protection at the edge

### Threat: Man-in-the-Middle

**Attack:** Intercept agent-to-API traffic to steal tokens or modify metrics.

**Mitigations:**

- HTTPS only (Vercel enforces TLS)
- Agent validates TLS certificates (Go's default HTTP client does this)
- HSTS headers on dashboard

### Threat: Privilege Escalation

**Attack:** USER role attempts to access ADMIN-only routes or other users' machines.

**Mitigations:**

- Role check on every API route (not just middleware — defense in depth)
- Machine access verified per-request against `machine_access` table
- ADMIN role cannot be self-assigned (only existing ADMIN can promote)
- First registered user gets ADMIN (bootstrap only)

### Threat: Data Exfiltration

**Attack:** Authorized user attempts to access machines they should not see.

**Mitigations:**

- Row-level access control: every machine query includes `WHERE user_id = $1 OR EXISTS (SELECT 1 FROM machine_access WHERE ...)`
- No bulk export endpoint (metrics only queryable per-machine)
- ADMIN can see all machines (by design — admin is trusted)

---

## 11. Performance Considerations

### Serverless Cold Starts

| Strategy                           | Impact                                                     |
| ---------------------------------- | ---------------------------------------------------------- |
| Lazy DB client initialization      | Avoid connection on import; connect on first query         |
| Neon serverless driver (WebSocket) | ~50ms connection vs ~200ms TCP                             |
| Minimal route imports              | Each route only imports what it needs                      |
| Edge Runtime for auth middleware   | < 50ms cold start vs ~300ms Node.js                        |
| Keep function bundles small        | Faster download from Vercel's CDN to execution environment |

### Bulk Insert vs. Individual Inserts

| Approach           | 10 metrics              | 60 metrics |
| ------------------ | ----------------------- | ---------- |
| Individual INSERTs | ~100ms (10 round-trips) | ~600ms     |
| Multi-row INSERT   | ~15ms (1 round-trip)    | ~30ms      |

Multi-row INSERT is 5-20x faster. Non-negotiable for serverless.

### Index Strategy

```sql
-- Primary: machine + time range queries (dashboard)
CREATE INDEX idx_metrics_machine_time ON metrics (machine_id, timestamp DESC);

-- Cleanup: delete old metrics
CREATE INDEX idx_metrics_timestamp ON metrics (timestamp);

-- Auth: token lookup (agent ingestion)
CREATE INDEX idx_machines_token ON machines (machine_token);

-- Auth: user email lookup (login)
CREATE INDEX idx_users_email ON users (email);
```

**Why `(machine_id, timestamp DESC)`:** The most common query is "get metrics for machine X between time A and B, ordered by time descending." This composite index serves this query with an index-only scan (no table scan, no sort).

**Why no GIN index on JSONB columns:** JSONB columns (cpu_cores, disk_usage) are never queried with WHERE clauses — they are only read after fetching rows by machine_id + timestamp. A GIN index would waste space and slow inserts.

### Connection Pooling with Neon

Neon's serverless driver (`@neondatabase/serverless`) handles connection pooling automatically:

- Uses WebSocket connections that multiplex queries
- No need for external pgBouncer
- Connection is established on first query and reused across queries within the same invocation
- Across invocations: new connection per cold start, reused in warm invocations

**Configuration:**

```
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
```

No pool configuration needed. The driver handles it.

### Payload Compression

- **Agent to API:** Gzip-compressed JSON. Typical compression ratio: 5-10x for repetitive metric data.
- **API to Dashboard:** Standard Vercel/Next.js compression (brotli/gzip) for responses.
- **Savings:** A batch of 10 metrics (~5KB JSON) compresses to ~800 bytes.

### Query Optimization for Dashboard

**Time-range query pattern:**

```sql
SELECT timestamp, cpu_overall, cpu_cores, ram_used, ram_total,
       disk_usage, network_rx, network_tx
FROM metrics
WHERE machine_id = $1
  AND timestamp >= $2
  AND timestamp <= $3
ORDER BY timestamp DESC
LIMIT $4;
```

**Optimizations:**

1. Index scan on `(machine_id, timestamp DESC)` — no seq scan
2. LIMIT prevents fetching more data than the chart can display (~500 points max)
3. For long ranges (7d, 30d): query `metrics_hourly` or `metrics_daily` instead of raw
4. Process snapshots fetched separately, only for the latest metric (not the entire range)

---

## 12. Scaling Strategy

### Vertical Scaling

| Layer            | Strategy                                               |
| ---------------- | ------------------------------------------------------ |
| Database queries | Add indexes, optimize SQL, use EXPLAIN ANALYZE         |
| API routes       | Reduce round-trips (bulk ops), minimize payload size   |
| Agent            | Already minimal footprint — no vertical scaling needed |
| Dashboard        | Reduce chart data points, paginate process tables      |

### Horizontal Scaling

| Layer            | Strategy                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| Vercel functions | Auto-scales horizontally by default. Each request gets its own function instance. No configuration needed. |
| Neon database    | Auto-scaling compute. Read replicas available on paid plans for read-heavy dashboard queries.              |
| Agent            | One agent per machine. No horizontal scaling concept — each is independent.                                |

### Vercel Free Tier Boundaries

| Resource    | Free Tier      | When to Upgrade                        |
| ----------- | -------------- | -------------------------------------- |
| Invocations | 100K/month     | 3+ machines at 60s interval            |
| Bandwidth   | 100GB/month    | Unlikely to hit with metric data       |
| Execution   | 10s/invocation | Unlikely to hit with optimized queries |
| Builds      | 6000 min/month | Unlikely to hit                        |

**Upgrade path:** Vercel Pro ($20/month) provides 1M invocations, 1TB bandwidth, 60s execution. Sufficient for 20+ machines.

### Neon Free Tier Boundaries

| Resource | Free Tier               | When to Upgrade                                      |
| -------- | ----------------------- | ---------------------------------------------------- |
| Storage  | 0.5GB                   | ~2 months of raw data for 1 machine at 10s intervals |
| Compute  | 191 compute hours/month | Sufficient for moderate query load                   |
| Branches | 10                      | Sufficient for dev/staging                           |

**Upgrade path:** Neon Pro ($19/month) provides 10GB storage, unlimited compute hours. With 7-day raw retention and aggregation, 0.5GB lasts much longer.

### Scaling Recommendations by Machine Count

| Machines | Tier                    | Agent Interval | Notes                       |
| -------- | ----------------------- | -------------- | --------------------------- |
| 1-2      | Free (Vercel + Neon)    | 60s            | Comfortable within limits   |
| 3-5      | Vercel Pro + Neon Free  | 60s            | Pro invocations needed      |
| 5-10     | Vercel Pro + Neon Pro   | 30-60s         | More storage needed         |
| 10-20    | Vercel Pro + Neon Pro   | 30s            | Consider read replicas      |
| 20+      | Vercel Pro + Neon Scale | 15-30s         | Read replicas, partitioning |

---

## 13. Future Improvements

### Phase 2: Real-Time Updates

- **WebSocket via Vercel:** Use Vercel's WebSocket support or a service like Pusher/Ably
- **Server-Sent Events (SSE):** Simpler alternative — dashboard opens SSE connection, API pushes new metrics as they arrive
- **Benefit:** Dashboard updates instantly without 30s polling

### Phase 3: Alerting System

- **Threshold alerts:** CPU > 90% for 5 minutes, RAM > 95%, Disk > 90%
- **Notification channels:** Email (via Resend/SendGrid), Webhook (Slack, Discord)
- **Alert rules table:** `alerts (id, machine_id, metric, operator, threshold, duration, channel, enabled)`
- **Evaluation:** Check thresholds during metric ingestion (piggyback on existing API calls)
- **Cooldown:** Prevent alert storms with per-alert cooldown periods

### Phase 4: Anomaly Detection

- **Statistical:** Z-score based — alert when metric deviates > 2 standard deviations from rolling 24h average
- **Trend detection:** Linear regression on hourly data to predict disk full, RAM exhaustion
- **ML-based (future):** Train simple models on historical data to detect unusual patterns
- **Implementation:** Run as a scheduled job (Vercel Cron) analyzing recent metrics

### Phase 5: Multi-Platform Agent

- **macOS support:** Replace WMI calls with sysctl, IOKit, `system_profiler`
- **Linux support:** Read from /proc/stat, /proc/meminfo, /sys/class/thermal
- **Build matrix:** `GOOS=darwin GOARCH=arm64`, `GOOS=linux GOARCH=amd64`
- **Platform interface:** Already designed for this — implement `platform.Darwin{}` and `platform.Linux{}`

### Phase 6: Mobile App

- **React Native or Expo:** Share types with web dashboard
- **Push notifications:** For alerts (Firebase Cloud Messaging)
- **Minimal scope:** View machine status, recent metrics, active alerts

### Phase 7: Metric Aggregation Pipeline

- **Replace Vercel Cron:** Use a dedicated worker (Vercel Edge Functions or external) for continuous aggregation
- **Materialized views:** For frequently-accessed dashboard queries
- **Downsampling:** Automatically reduce resolution for older data

### Phase 8: Custom Dashboards

- **User-defined layouts:** Drag-and-drop chart arrangement
- **Custom queries:** Select which metrics to display, time ranges, aggregation functions
- **Saved views:** Store dashboard configurations per user
- **Sharing:** Public dashboard links with read-only access

---

## 14. Deployment Checklist

### Step 1: Set Up Neon Database

1. Create account at [neon.tech](https://neon.tech)
2. Create a new project (region: closest to Vercel deployment, e.g., `us-east-1`)
3. Copy the connection string: `postgresql://user:pass@host/dbname?sslmode=require`
4. Open the SQL editor in Neon console
5. Run the full schema SQL from Section 3 of this document
6. Verify all tables and indexes are created
7. Create a development branch for local development

### Step 2: Deploy Next.js to Vercel

1. Push the `web/` directory to a GitHub repository
2. Connect the repository to Vercel
3. Set the root directory to `web/` in Vercel project settings
4. Configure environment variables (see below)
5. Deploy — Vercel auto-detects Next.js and configures build
6. Verify the deployment URL works
7. Set up a custom domain (optional)

### Step 3: Configure Environment Variables

Set these in Vercel dashboard under Settings > Environment Variables:

| Variable              | Value                                     | Description                     |
| --------------------- | ----------------------------------------- | ------------------------------- |
| `DATABASE_URL`        | `postgresql://...`                        | Neon connection string (pooled) |
| `JWT_SECRET`          | Random 64-char hex                        | Access token signing secret     |
| `JWT_REFRESH_SECRET`  | Random 64-char hex (different from above) | Refresh token signing secret    |
| `NEXT_PUBLIC_APP_URL` | `https://your-domain.vercel.app`          | Public URL for CORS/CSRF checks |

**Generate secrets:**

```bash
openssl rand -hex 32  # Run twice, once for each secret
```

### Step 4: First-Time Setup

1. Navigate to the deployed URL
2. Register the first user account (automatically becomes ADMIN)
3. Log in to the dashboard
4. Navigate to Machines > Register New Machine
5. Enter a machine name, select OS/arch
6. Copy the generated machine token
7. Save the token — it is shown only once (can be rotated later)

### Step 5: Build and Distribute the Go Agent

1. Install Go 1.21+ on the build machine
2. Clone the repository
3. Build using the build scripts:
   ```bash
   ./build.sh --platform windows/amd64 --version 1.0.0
   ```
   Or for all platforms:
   ```bash
   ./build.sh --all --version 1.0.0
   ```
4. Create the configuration file on the target machine:
   ```yaml
   # %ProgramData%\Vitalis\agent.yaml
   server:
     url: "https://your-domain.vercel.app"
     machine_token: "your-64-char-hex-token"
   collection:
     interval: 60s
     process_top_n: 30
   sender:
     batch_size: 60
     send_interval: 30s
   buffer:
     max_size_mb: 50
     path: "%ProgramData%\\Vitalis\\buffer.db"
   ```
5. Copy the binary and config to the target machine
6. Install as Windows service:
   ```bash
   vitalis-agent.exe --install
   ```
7. Start the service:
   ```bash
   net start VitalisAgent
   ```
8. Verify in the dashboard that the machine appears as "Online"

### Step 6: Set Up Data Cleanup (Vercel Cron)

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/admin/cleanup",
      "schedule": "0 3 * * *"
    }
  ]
}
```

This runs the cleanup/aggregation job daily at 3:00 AM UTC.

### Step 7: Verify End-to-End

1. Confirm agent is sending metrics (check `last_seen` in dashboard)
2. Verify charts are populating with data
3. Check process table shows running processes
4. Test time range selectors (1h, 6h, 24h)
5. Test machine token rotation (rotate, update agent config, verify reconnection)
6. Test user registration and machine sharing
7. Verify cleanup cron runs successfully (check Vercel logs)

### Environment Variable Summary

| Variable              | Required | Where Used                                          |
| --------------------- | -------- | --------------------------------------------------- |
| `DATABASE_URL`        | Yes      | API routes, RSC data fetching                       |
| `JWT_SECRET`          | Yes      | Access token sign/verify                            |
| `JWT_REFRESH_SECRET`  | Yes      | Refresh token sign/verify                           |
| `NEXT_PUBLIC_APP_URL` | Yes      | CSRF origin check, client-side API calls            |
| `CRON_SECRET`         | Optional | Protect cleanup endpoint from unauthorized triggers |

---

_This document is the single source of truth for the Vitalis architecture. All implementation decisions should reference this document. Update it as the system evolves._
