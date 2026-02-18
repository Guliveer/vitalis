# Deployment Guide

Step-by-step instructions for deploying Vitalis to production using **Neon** (database), **Vercel** (web app), and the **Go agent** on target machines.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Database Setup (Neon)](#2-database-setup-neon)
3. [Web App Deployment (Vercel)](#3-web-app-deployment-vercel)
4. [Agent Build & Distribution](#4-agent-build--distribution)
5. [Agent Deployment](#5-agent-deployment)
6. [First-Time Setup Flow](#6-first-time-setup-flow)
7. [Environment Variables Reference](#7-environment-variables-reference)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Prerequisites

| Requirement           | Version / Details                                |
| --------------------- | ------------------------------------------------ |
| **Neon account**      | Free tier — [neon.tech](https://neon.tech)       |
| **Vercel account**    | Free tier — [vercel.com](https://vercel.com)     |
| **Go**                | 1.21+ — [go.dev/dl](https://go.dev/dl/)          |
| **Node.js**           | 18+ (only needed for local development)          |
| **Git**               | Any recent version                               |
| **GitHub repository** | Fork or push the project to your own GitHub repo |

---

## 2. Database Setup (Neon)

### 2.1 Create a Neon Project

1. Sign in at [console.neon.tech](https://console.neon.tech)
2. Click **New Project**
3. Choose a project name (e.g., `vitalis`)
4. Select a region **closest to your Vercel deployment** (e.g., `us-east-1` or `eu-central-1`)
5. Click **Create Project**

### 2.2 Create the Database

Neon creates a default database (`neondb`) automatically. You can use it or create a dedicated one:

```sql
CREATE DATABASE vitalis;
```

### 2.3 Run the Migration

Open the **SQL Editor** in the Neon console (or use `psql`) and run the migration file:

```bash
psql "postgresql://user:password@ep-xxxxx.region.aws.neon.tech/vitalis?sslmode=require" \
  -f web/src/lib/db/migrations/0000_initial.sql
```

This creates all tables: [`users`](web/src/lib/db/migrations/0000_initial.sql:13), [`machines`](web/src/lib/db/migrations/0000_initial.sql:31), [`machine_access`](web/src/lib/db/migrations/0000_initial.sql), [`metrics`](web/src/lib/db/migrations/0000_initial.sql), [`process_snapshots`](web/src/lib/db/migrations/0000_initial.sql), [`metrics_hourly`](web/src/lib/db/migrations/0000_initial.sql), and [`metrics_daily`](web/src/lib/db/migrations/0000_initial.sql) along with all indexes.

### 2.4 Copy the Connection String

From the Neon dashboard, copy the **pooled connection string**:

```
postgresql://user:password@ep-xxxxx-pooler.region.aws.neon.tech/vitalis?sslmode=require
```

> **Note:** Use the **pooled** endpoint (contains `-pooler` in the hostname) for serverless environments like Vercel. This provides built-in connection pooling optimized for short-lived function invocations.

---

## 3. Web App Deployment (Vercel)

### 3.1 Push to GitHub

Ensure the project is pushed to a GitHub repository:

```bash
git remote add origin https://github.com/your-username/vitalis.git
git push -u origin main
```

### 3.2 Import to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository** and select your repo
3. Set the **Root Directory** to `web`
4. Vercel auto-detects Next.js — no build configuration needed
5. Click **Deploy** (it will fail initially without environment variables — that's expected)

### 3.3 Set Environment Variables

In the Vercel dashboard, go to **Settings → Environment Variables** and add:

| Variable              | Value                                       | Notes                         |
| --------------------- | ------------------------------------------- | ----------------------------- |
| `DATABASE_URL`        | `postgresql://...pooler...?sslmode=require` | Neon pooled connection string |
| `JWT_SECRET`          | _(generate — see below)_                    | Access token signing key      |
| `JWT_REFRESH_SECRET`  | _(generate — see below)_                    | Refresh token signing key     |
| `CRON_SECRET`         | _(generate — see below)_                    | Protects the cleanup endpoint |
| `NEXT_PUBLIC_APP_URL` | `https://your-project.vercel.app`           | Your Vercel deployment URL    |

Generate each secret independently:

```bash
openssl rand -base64 32
# Example output: K7x2mP9qR4tW1vN8bF3jL6hD0sA5eY+cG2uX7zQ9nI=

openssl rand -base64 32
# Run again for JWT_REFRESH_SECRET

openssl rand -base64 32
# Run again for CRON_SECRET
```

> **Important:** `JWT_SECRET` and `JWT_REFRESH_SECRET` **must be different** values. Using the same secret for both would allow access tokens to be used as refresh tokens and vice versa.

### 3.4 Redeploy

After setting environment variables, trigger a redeployment:

1. Go to **Deployments** in the Vercel dashboard
2. Click the **⋮** menu on the latest deployment
3. Select **Redeploy**

### 3.5 Verify Cron Job

The [`web/vercel.json`](web/vercel.json) file configures a daily cleanup cron:

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

This runs the data aggregation and cleanup job daily at **3:00 AM UTC**. Verify it appears in **Settings → Cron Jobs** in the Vercel dashboard.

### 3.6 Test the Deployment

Open your deployment URL and verify:

- `https://your-project.vercel.app/login` — login page loads
- `https://your-project.vercel.app/register` — registration page loads

---

## 4. Agent Build & Distribution

The agent binary is **self-contained** — configuration is embedded at build time, so there is no need to distribute a separate config file alongside the binary.

### Build with Embedded Config

The build scripts ([`build.sh`](build.sh) for macOS/Linux and [`build.ps1`](build.ps1) for Windows) select a configuration from [`agent/configs/`](agent/configs/) and embed it into the binary.

#### Step 1: Create a Config for the Target Machine

If one doesn't already exist, create a config file in `agent/configs/`:

```bash
cp agent/configs/agent.yaml agent/configs/agent_myserver.yaml
```

Edit it with the target machine's settings:

```yaml
server:
  url: "https://your-project.vercel.app"
  machine_token: "mtoken_your-machine-token-here"

collection:
  interval: "15s"
  batch_interval: "30s"
  top_processes: 10

buffer:
  max_size_mb: 50
  db_path: "/var/lib/vitalis/buffer"

logging:
  level: "info"
  file: "/var/log/vitalis/agent.log"
```

#### Step 2: Build with the Config

```bash
# Build for current platform with a specific config
./build.sh --config agent_myserver --version 1.0.0

# Build for all platforms
./build.sh --all --config agent_myserver --version 1.0.0

# Cross-compile for a specific platform
./build.sh --platform windows/amd64 --config agent_myserver

# Interactive config selection (omit --config)
./build.sh --version 1.0.0
```

#### Windows Users (PowerShell)

```powershell
.\build.ps1 -Config "agent_myserver" -All -Version "1.0.0"
```

Binaries are output to the `build/` directory with platform-specific naming (e.g., `vitalis-agent-windows-amd64.exe`, `vitalis-agent-linux-amd64`).

### Versioned Build

The build scripts automatically embed the version string. Verify with:

```bash
./build/vitalis-agent --version
# Output: vitalis-agent 1.0.0
```

---

## 5. Agent Deployment

Deployment is simplified to a single step: **copy the binary and run it**. The agent automatically registers itself as a system service on first run.

### Deployment Overview

| Step | Before (old workflow)                  | After (new workflow)                      |
| ---- | -------------------------------------- | ----------------------------------------- |
| 1    | Copy binary to target machine          | Copy binary to target machine             |
| 2    | Copy config file to target machine     | Run the binary                            |
| 3    | Edit config with correct machine token | _(done — agent auto-installs as service)_ |
| 4    | Install as service manually            | —                                         |
| 5    | Start the service                      | —                                         |

### 5.1 Windows Deployment

```powershell
# Copy the binary to the target machine
copy vitalis-agent-windows-amd64.exe "C:\Program Files\Vitalis\vitalis-agent.exe"

# Run it (auto-installs as Windows Service "VitalisAgent")
& "C:\Program Files\Vitalis\vitalis-agent.exe"
```

On first run, the agent:

1. Loads the embedded configuration
2. Detects it is not registered as a Windows Service
3. Registers itself as `VitalisAgent` with automatic startup
4. Begins collecting and sending metrics

#### Verify

```powershell
sc query VitalisAgent                    # Check service status
Get-EventLog -LogName Application -Source VitalisAgent -Newest 10  # View logs
```

#### Service Management

```powershell
sc stop VitalisAgent                     # Stop
sc start VitalisAgent                    # Start
sc stop VitalisAgent && sc start VitalisAgent  # Restart
```

#### Uninstall

```powershell
& "C:\Program Files\Vitalis\vitalis-agent.exe" --uninstall
```

### 5.2 Linux Deployment

```bash
# Copy the binary to the target machine
sudo mkdir -p /opt/vitalis
sudo cp vitalis-agent-linux-amd64 /opt/vitalis/vitalis-agent
sudo chmod +x /opt/vitalis/vitalis-agent

# Run it (auto-installs as systemd service "vitalis-agent")
sudo /opt/vitalis/vitalis-agent
```

On first run, the agent:

1. Loads the embedded configuration
2. Detects it is not registered as a systemd service
3. Writes a unit file to `/etc/systemd/system/vitalis-agent.service`
4. Enables and starts the service
5. Begins collecting and sending metrics

#### Verify

```bash
sudo systemctl status vitalis-agent      # Check service status
sudo journalctl -u vitalis-agent -f      # View logs
```

#### Service Management

```bash
sudo systemctl stop vitalis-agent        # Stop
sudo systemctl start vitalis-agent       # Start
sudo systemctl restart vitalis-agent     # Restart
```

#### Uninstall

```bash
sudo /opt/vitalis/vitalis-agent --uninstall
```

### 5.3 macOS Deployment

```bash
# Copy the binary to the target machine
sudo mkdir -p /opt/vitalis
sudo cp vitalis-agent-darwin-arm64 /opt/vitalis/vitalis-agent
sudo chmod +x /opt/vitalis/vitalis-agent

# Run it (auto-installs as launchd daemon "com.vitalis.agent")
sudo /opt/vitalis/vitalis-agent
```

On first run, the agent:

1. Loads the embedded configuration
2. Detects it is not registered as a launchd daemon
3. Writes a plist to `/Library/LaunchDaemons/com.vitalis.agent.plist`
4. Loads the daemon
5. Begins collecting and sending metrics

#### Verify

```bash
launchctl list | grep vitalis            # Check daemon status
cat /var/log/vitalis/stdout.log          # View logs
```

#### Uninstall

```bash
sudo /opt/vitalis/vitalis-agent --uninstall
```

### 5.4 Autostart Behavior Summary

| Platform | Mechanism             | Service Name        | Auto-restart on crash | Start at boot         | Requires      |
| -------- | --------------------- | ------------------- | --------------------- | --------------------- | ------------- |
| Windows  | Windows Service (SCM) | `VitalisAgent`      | SCM recovery actions  | Automatic start type  | Administrator |
| Linux    | systemd unit file     | `vitalis-agent`     | `Restart=always`      | `WantedBy=multi-user` | root          |
| macOS    | launchd plist         | `com.vitalis.agent` | `KeepAlive=true`      | `RunAtLoad=true`      | root          |

### 5.5 Manual Service Control

If you prefer not to rely on auto-installation, use the `--install` and `--uninstall` flags for explicit control:

```bash
# Manually install as a system service
sudo ./vitalis-agent --install

# Manually remove the system service
sudo ./vitalis-agent --uninstall
```

### 5.6 Runtime Environment Variable Overrides

Even with embedded config, you can override specific values at runtime using environment variables:

| Variable           | Overrides              | Example                                       |
| ------------------ | ---------------------- | --------------------------------------------- |
| `SA_SERVER_URL`    | `server.url`           | `https://your-app.vercel.app`                 |
| `SA_MACHINE_TOKEN` | `server.machine_token` | `mtoken_a1b2c3d4-e5f6-7890-abcd-ef1234567890` |
| `SA_LOG_LEVEL`     | `logging.level`        | `debug`                                       |

For systemd services, set these in an environment file or override:

```bash
sudo systemctl edit vitalis-agent
```

```ini
[Service]
Environment="SA_LOG_LEVEL=debug"
```

---

## 6. First-Time Setup Flow

Follow these steps in order after deploying the web app:

### Step 1: Register the First User

Navigate to `https://your-project.vercel.app/register` and create an account. The **first registered user is automatically promoted to ADMIN** — this is the only way to get the initial admin account.

### Step 2: Log In

Go to `https://your-project.vercel.app/login` and sign in with your new credentials.

### Step 3: Create a Machine

From the dashboard, create a new machine:

- Enter a descriptive name (e.g., "Home Desktop", "Dev Server")
- Optionally set the OS and architecture

### Step 4: Save the Machine Token

After creation, the machine token is displayed **once**. Copy and save it securely:

```
mtoken_a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

> **Warning:** The token is only shown at creation time. If you lose it, you'll need to delete the machine and create a new one.

### Step 5: Create a Config and Build the Agent

Create a config file for the machine in [`agent/configs/`](agent/configs/):

```yaml
server:
  url: "https://your-project.vercel.app"
  machine_token: "mtoken_a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

Build the agent with the config embedded:

```bash
./build.sh --config agent_myserver --version 1.0.0
```

Alternatively, use the environment variable override (set `SA_MACHINE_TOKEN` on the target machine) if you prefer a generic build.

### Step 6: Deploy and Run the Agent

Copy the binary to the target machine and run it. The agent auto-installs as a system service:

```bash
sudo cp build/vitalis-agent /opt/vitalis/vitalis-agent
sudo /opt/vitalis/vitalis-agent
```

### Step 7: Verify

- The machine should appear as **Online** in the dashboard within 30 seconds
- CPU, RAM, disk, and network charts should begin populating
- The process table should show running processes

---

## 7. Environment Variables Reference

### Web App ([`.env.example`](.env.example))

| Variable                  | Required | Default | Description                                                                                                            |
| ------------------------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`            | **Yes**  | —       | Neon PostgreSQL pooled connection string with `?sslmode=require`                                                       |
| `JWT_SECRET`              | **Yes**  | —       | HS256 signing key for access tokens (min 32 characters)                                                                |
| `JWT_REFRESH_SECRET`      | **Yes**  | —       | HS256 signing key for refresh tokens (min 32 characters, must differ from `JWT_SECRET`)                                |
| `CRON_SECRET`             | **Yes**  | —       | Bearer token for authenticating Vercel Cron requests to [`/api/admin/cleanup`](web/src/app/api/admin/cleanup/route.ts) |
| `NEXT_PUBLIC_APP_URL`     | **Yes**  | —       | Public URL of the deployment (e.g., `https://your-app.vercel.app`)                                                     |
| `RATE_LIMIT_WINDOW_MS`    | No       | `60000` | Rate limit window in milliseconds                                                                                      |
| `RATE_LIMIT_MAX_REQUESTS` | No       | `10`    | Maximum requests per rate limit window                                                                                 |

### Agent (environment variable overrides)

These override the embedded configuration at runtime:

| Variable           | Required | Default                            | Description                                                     |
| ------------------ | -------- | ---------------------------------- | --------------------------------------------------------------- |
| `SA_SERVER_URL`    | No       | Embedded / `http://localhost:3000` | API server URL (overrides embedded `server.url`)                |
| `SA_MACHINE_TOKEN` | No       | Embedded                           | Machine authentication token (overrides `server.machine_token`) |
| `SA_LOG_LEVEL`     | No       | Embedded / `info`                  | Log level: `debug`, `info`, `warn`, `error`                     |

---

## 8. Troubleshooting

### Agent Can't Connect to Server

| Symptom                             | Cause                                 | Solution                                                                                                                          |
| ----------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `send request: connection refused`  | Server URL is wrong or server is down | Verify `server.url` in the embedded config or override with `SA_SERVER_URL`. Check Vercel deployment status.                      |
| `send request: TLS handshake error` | HTTPS certificate issue               | Ensure the URL uses `https://`. Check Vercel domain config.                                                                       |
| `server returned 401`               | Invalid machine token                 | Verify the token matches what was generated in the dashboard. Rebuild with the correct token or override with `SA_MACHINE_TOKEN`. |
| `server returned 429`               | Rate limit exceeded                   | Increase `collection.interval` or `collection.batch_interval` in the config and rebuild.                                          |

### Auto-Install Fails

| Symptom                                              | Cause                                   | Solution                                                                       |
| ---------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| `Auto-install failed (may need elevated privileges)` | Not running as admin/root               | Run with `sudo` (Linux/macOS) or as Administrator (Windows)                    |
| `Install failed: connecting to SCM`                  | Not running as Administrator on Windows | Right-click → Run as Administrator, or use `--install` from an elevated prompt |
| `Install failed: creating unit file`                 | Not running as root on Linux            | Use `sudo ./vitalis-agent` or `sudo ./vitalis-agent --install`                 |

### No Metrics Appearing in Dashboard

1. **Check agent is running:** `systemctl status vitalis-agent` (Linux), `sc query VitalisAgent` (Windows), or `launchctl list | grep vitalis` (macOS)
2. **Check agent logs:** Look for `"Batch sent successfully"` messages in the log file
3. **Check machine token:** Ensure the embedded token matches the one from the dashboard, or override with `SA_MACHINE_TOKEN`
4. **Check `last_seen`:** If the machine shows a recent `last_seen` but no charts, the time range selector may need adjusting

### Dashboard Shows Machine as Offline

- The machine is considered **offline** if `last_seen` is older than 2 minutes
- Verify the agent is running and sending metrics
- Check for network connectivity between the agent machine and Vercel
- Review agent logs for send errors

### Database Connection Errors

| Error                             | Solution                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| `connection refused`              | Verify `DATABASE_URL` is correct. Check Neon project status.                          |
| `SSL required`                    | Ensure `?sslmode=require` is in the connection string.                                |
| `too many connections`            | Use the **pooled** endpoint (hostname contains `-pooler`).                            |
| `relation "users" does not exist` | Run the migration: `psql $DATABASE_URL -f web/src/lib/db/migrations/0000_initial.sql` |

### Cron Job Not Running

1. Verify [`web/vercel.json`](web/vercel.json) contains the cron configuration
2. Check **Settings → Cron Jobs** in the Vercel dashboard — the job should be listed
3. Verify `CRON_SECRET` is set in Vercel environment variables
4. Check **Function Logs** in Vercel for the `/api/admin/cleanup` route
5. Test manually: `curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/admin/cleanup`

### Common Vercel Deployment Issues

| Issue                    | Solution                                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build fails              | Ensure root directory is set to `web` in Vercel project settings                                                                                            |
| 500 errors on API routes | Check environment variables are set for all environments (Production, Preview, Development)                                                                 |
| Cron returns 405         | Ensure the cleanup route exports both [`GET`](web/src/app/api/admin/cleanup/route.ts:129) and [`POST`](web/src/app/api/admin/cleanup/route.ts:136) handlers |
