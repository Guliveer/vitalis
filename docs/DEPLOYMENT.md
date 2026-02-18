# Deployment Guide

Step-by-step instructions for deploying Vitalis to production using **Neon** (database), **Vercel** (web app), and the **Go agent** on target machines.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Database Setup (Neon)](#2-database-setup-neon)
3. [Web App Deployment (Vercel)](#3-web-app-deployment-vercel)
4. [Agent Build & Distribution](#4-agent-build--distribution)
5. [Agent Installation (Windows)](#5-agent-installation-windows)
6. [Agent Installation (Linux / macOS)](#6-agent-installation-linux--macos)
7. [First-Time Setup Flow](#7-first-time-setup-flow)
8. [Environment Variables Reference](#8-environment-variables-reference)
9. [Troubleshooting](#9-troubleshooting)

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

Build the agent binary from the [`agent/`](agent/) directory using the provided build scripts.

### Using Build Scripts (Recommended)

The project includes cross-platform build scripts ([`build.sh`](build.sh) for macOS/Linux and [`build.ps1`](build.ps1) for Windows):

#### Build for Current Platform

```bash
./build.sh
```

#### Build All Platforms

```bash
./build.sh --all --version 1.0.0
```

#### Cross-Compile for a Specific Platform

```bash
# Windows
./build.sh --platform windows/amd64

# Linux
./build.sh --platform linux/amd64

# macOS (Apple Silicon)
./build.sh --platform darwin/arm64

# macOS (Intel)
./build.sh --platform darwin/amd64
```

#### Windows Users (PowerShell)

```powershell
.\build.ps1 -All -Version "1.0.0"
```

Binaries are output to the `build/` directory with platform-specific naming (e.g., `vitalis-agent-windows-amd64.exe`, `vitalis-agent-linux-amd64`).

### Versioned Build

The build scripts automatically embed the version string. Verify with:

```bash
./build/vitalis-agent --version
# Output: vitalis-agent 1.0.0
```

---

## 5. Agent Installation (Windows)

### 5.1 Create Installation Directory

```powershell
mkdir "C:\Program Files\Vitalis"
```

### 5.2 Copy Files

Copy the built binary and create a configuration file:

```powershell
copy build\vitalis-agent-windows-amd64.exe "C:\Program Files\Vitalis\vitalis-agent.exe"
```

### 5.3 Create Configuration

Create `C:\Program Files\Vitalis\agent.yaml`:

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
  db_path: "C:\\ProgramData\\Vitalis\\buffer"

logging:
  level: "info"
  file: "C:\\ProgramData\\Vitalis\\agent.log"
```

Create the data directory:

```powershell
mkdir "C:\ProgramData\Vitalis"
```

### 5.4 Install as Windows Service

```powershell
sc create VitalisAgent ^
  binPath= "\"C:\Program Files\Vitalis\vitalis-agent.exe\" --config \"C:\Program Files\Vitalis\agent.yaml\"" ^
  start= auto ^
  DisplayName= "Vitalis Agent"
```

### 5.5 Start the Service

```powershell
sc start VitalisAgent
```

### 5.6 Verify

- Check the service status: `sc query VitalisAgent`
- View logs: Open **Event Viewer → Windows Logs → Application** and filter by source `VitalisAgent`
- Check the log file: `type "C:\ProgramData\Vitalis\agent.log"`
- Verify in the dashboard: the machine should appear as **Online**

### 5.7 Service Management

```powershell
# Stop the service
sc stop VitalisAgent

# Restart the service
sc stop VitalisAgent && sc start VitalisAgent

# Remove the service
sc stop VitalisAgent
sc delete VitalisAgent
```

---

## 6. Agent Installation (Linux / macOS)

### 6.1 Copy Files

```bash
sudo mkdir -p /opt/vitalis
sudo cp build/vitalis-agent-linux-amd64 /opt/vitalis/vitalis-agent
sudo chmod +x /opt/vitalis/vitalis-agent
```

### 6.2 Create Configuration

```bash
sudo mkdir -p /etc/vitalis
sudo tee /etc/vitalis/agent.yaml > /dev/null << 'EOF'
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
EOF
```

Create data directories:

```bash
sudo mkdir -p /var/lib/vitalis
sudo mkdir -p /var/log/vitalis
```

### 6.3 Linux — systemd Service

Create `/etc/systemd/system/vitalis-agent.service`:

```ini
[Unit]
Description=Vitalis Monitoring Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/opt/vitalis/vitalis-agent --config /etc/vitalis/agent.yaml
Restart=always
RestartSec=10
User=root

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/vitalis /var/log/vitalis

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable vitalis-agent
sudo systemctl start vitalis-agent
```

Check status:

```bash
sudo systemctl status vitalis-agent
sudo journalctl -u vitalis-agent -f
```

### 6.4 macOS — launchd Service

Create `~/Library/LaunchAgents/com.vitalis.agent.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.vitalis.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/vitalis/vitalis-agent</string>
        <string>--config</string>
        <string>/etc/vitalis/agent.yaml</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/var/log/vitalis/stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/vitalis/stderr.log</string>
</dict>
</plist>
```

Load and start:

```bash
launchctl load ~/Library/LaunchAgents/com.vitalis.agent.plist
```

Check status:

```bash
launchctl list | grep vitalis
```

Stop and unload:

```bash
launchctl unload ~/Library/LaunchAgents/com.vitalis.agent.plist
```

---

## 7. First-Time Setup Flow

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

### Step 5: Configure the Agent

Set the machine token in your [`agent.yaml`](agent/configs/agent.yaml) configuration file:

```yaml
server:
  url: "https://your-project.vercel.app"
  machine_token: "mtoken_a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

Alternatively, use the environment variable (preferred for production):

```bash
export SA_MACHINE_TOKEN="mtoken_a1b2c3d4-e5f6-7890-abcd-ef1234567890"
export SA_SERVER_URL="https://your-project.vercel.app"
```

### Step 6: Start the Agent

Start the agent using your platform's service manager or run it directly:

```bash
./vitalis-agent --config /path/to/agent.yaml
```

### Step 7: Verify

- The machine should appear as **Online** in the dashboard within 30 seconds
- CPU, RAM, disk, and network charts should begin populating
- The process table should show running processes

---

## 8. Environment Variables Reference

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

| Variable           | Required | Default                               | Description                                                                      |
| ------------------ | -------- | ------------------------------------- | -------------------------------------------------------------------------------- |
| `SA_SERVER_URL`    | No       | Config file / `http://localhost:3000` | API server URL (overrides [`agent.yaml`](agent/configs/agent.yaml) `server.url`) |
| `SA_MACHINE_TOKEN` | No       | Config file                           | Machine authentication token (overrides `server.machine_token`)                  |
| `SA_LOG_LEVEL`     | No       | Config file / `info`                  | Log level: `debug`, `info`, `warn`, `error`                                      |

---

## 9. Troubleshooting

### Agent Can't Connect to Server

| Symptom                             | Cause                                 | Solution                                                       |
| ----------------------------------- | ------------------------------------- | -------------------------------------------------------------- |
| `send request: connection refused`  | Server URL is wrong or server is down | Verify `server.url` in config. Check Vercel deployment status. |
| `send request: TLS handshake error` | HTTPS certificate issue               | Ensure the URL uses `https://`. Check Vercel domain config.    |
| `server returned 401`               | Invalid machine token                 | Verify the token matches what was generated in the dashboard.  |
| `server returned 429`               | Rate limit exceeded                   | Increase `collection.interval` or `collection.batch_interval`. |

### No Metrics Appearing in Dashboard

1. **Check agent is running:** `systemctl status vitalis-agent` (Linux) or `sc query VitalisAgent` (Windows)
2. **Check agent logs:** Look for `"Batch sent successfully"` messages in the log file
3. **Check machine token:** Ensure the token in the agent config matches the one from the dashboard
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
