# API Reference

Complete API documentation for all Vitalis endpoints. The API is built with Next.js 14 API Routes and deployed on Vercel.

**Base URL:** `https://your-app.vercel.app`

---

## Table of Contents

- [Authentication](#authentication)
  - [POST /api/auth/register](#post-apiauthregister)
  - [POST /api/auth/login](#post-apiauthlogin)
  - [POST /api/auth/refresh](#post-apiauthrefresh)
  - [POST /api/auth/logout](#post-apiauthlogout)
- [Machines](#machines)
  - [GET /api/machines](#get-apimachines)
  - [POST /api/machines](#post-apimachines)
  - [GET /api/machines/[id]](#get-apimachinesid)
  - [PUT /api/machines/[id]](#put-apimachinesid)
  - [DELETE /api/machines/[id]](#delete-apimachinesid)
  - [GET /api/machines/[id]/metrics](#get-apimachinesidmetrics)
- [Ingestion](#ingestion)
  - [POST /api/ingest](#post-apiingest)
- [Admin](#admin)
  - [GET/POST /api/admin/cleanup](#getpost-apiadmincleanup)
- [Common Response Format](#common-response-format)
- [Error Codes](#error-codes)
- [Rate Limits](#rate-limits)

---

## Authentication

All authentication endpoints are defined in [`web/src/app/api/auth/`](web/src/app/api/auth/). Tokens are delivered via **httpOnly cookies** — no manual token management is required for browser-based clients.

### Auth Mechanism Summary

| Endpoint Type   | Auth Method                        | Header / Cookie                  |
| --------------- | ---------------------------------- | -------------------------------- |
| User endpoints  | JWT access token (httpOnly cookie) | Cookie: `access_token=<jwt>`     |
| Agent ingestion | Machine token (Bearer)             | `Authorization: Bearer <token>`  |
| Cron endpoint   | Cron secret (Bearer)               | `Authorization: Bearer <secret>` |

---

### `POST /api/auth/register`

Create a new user account. The **first registered user** is automatically assigned the `ADMIN` role.

**Source:** [`web/src/app/api/auth/register/route.ts`](web/src/app/api/auth/register/route.ts)

**Authentication:** None

**Rate Limit:** 10 requests per 15 minutes per IP

#### Request Body

```typescript
{
  email: string; // Valid email, max 255 chars
  password: string; // 8–128 chars, must contain uppercase, lowercase, and number
}
```

#### Example Request

```bash
curl -X POST https://your-app.vercel.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "SecurePass1"}'
```

#### Success Response — `201 Created`

```json
{
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "admin@example.com",
      "role": "ADMIN",
      "createdAt": "2026-02-17T12:00:00.000Z",
      "updatedAt": "2026-02-17T12:00:00.000Z"
    }
  }
}
```

Sets cookies: `access_token` (15 min), `refresh_token` (7 days, path: `/api/auth/refresh`)

#### Error Responses

| Status | Body                                                     | Cause                     |
| ------ | -------------------------------------------------------- | ------------------------- |
| `409`  | `{"error": "An account with this email already exists"}` | Email already registered  |
| `422`  | `{"error": "Validation failed", "fields": {...}}`        | Invalid email or password |
| `429`  | `{"error": "Too many requests..."}`                      | Rate limit exceeded       |
| `500`  | `{"error": "Internal server error"}`                     | Server error              |

---

### `POST /api/auth/login`

Authenticate with email and password. Returns JWT tokens via httpOnly cookies.

**Source:** [`web/src/app/api/auth/login/route.ts`](web/src/app/api/auth/login/route.ts)

**Authentication:** None

**Rate Limit:** 10 requests per 15 minutes per IP

#### Request Body

```typescript
{
  email: string; // Valid email, max 255 chars
  password: string; // 8–128 chars
}
```

#### Example Request

```bash
curl -X POST https://your-app.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "SecurePass1"}' \
  -c cookies.txt
```

#### Success Response — `200 OK`

```json
{
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "admin@example.com",
      "role": "ADMIN",
      "createdAt": "2026-02-17T12:00:00.000Z",
      "updatedAt": "2026-02-17T12:00:00.000Z"
    }
  }
}
```

Sets cookies: `access_token` (15 min), `refresh_token` (7 days)

#### Error Responses

| Status | Body                                  | Cause                   |
| ------ | ------------------------------------- | ----------------------- |
| `401`  | `{"error": "Invalid credentials"}`    | Wrong email or password |
| `422`  | `{"error": "Validation failed", ...}` | Invalid input format    |
| `429`  | `{"error": "Too many requests..."}`   | Rate limit exceeded     |

---

### `POST /api/auth/refresh`

Refresh the access token using the refresh token cookie. Issues a new token pair (token rotation).

**Source:** [`web/src/app/api/auth/refresh/route.ts`](web/src/app/api/auth/refresh/route.ts)

**Authentication:** Refresh token cookie

#### Example Request

```bash
curl -X POST https://your-app.vercel.app/api/auth/refresh \
  -b cookies.txt -c cookies.txt
```

#### Success Response — `200 OK`

```json
{
  "data": {
    "message": "Token refreshed"
  }
}
```

Sets new cookies: `access_token` (15 min), `refresh_token` (7 days)

#### Error Responses

| Status | Body                                            | Cause                     |
| ------ | ----------------------------------------------- | ------------------------- |
| `401`  | `{"error": "Refresh token required"}`           | No refresh token cookie   |
| `401`  | `{"error": "Invalid or expired refresh token"}` | Token expired or tampered |
| `401`  | `{"error": "User not found"}`                   | User account deleted      |

---

### `POST /api/auth/logout`

Clear authentication cookies to log the user out.

**Source:** [`web/src/app/api/auth/logout/route.ts`](web/src/app/api/auth/logout/route.ts)

**Authentication:** None (clears cookies regardless)

#### Example Request

```bash
curl -X POST https://your-app.vercel.app/api/auth/logout \
  -b cookies.txt -c cookies.txt
```

#### Success Response — `200 OK`

```json
{
  "data": {
    "message": "Logged out successfully"
  }
}
```

Clears cookies: `access_token`, `refresh_token` (Max-Age=0)

---

## Machines

Machine management endpoints. All require JWT authentication via the `access_token` cookie.

**Source:** [`web/src/app/api/machines/route.ts`](web/src/app/api/machines/route.ts), [`web/src/app/api/machines/[id]/route.ts`](web/src/app/api/machines/[id]/route.ts)

---

### `GET /api/machines`

List all machines accessible to the authenticated user (owned + shared).

**Authentication:** JWT cookie

#### Example Request

```bash
curl https://your-app.vercel.app/api/machines \
  -b cookies.txt
```

#### Success Response — `200 OK`

```json
{
  "data": {
    "machines": [
      {
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "userId": "550e8400-e29b-41d4-a716-446655440000",
        "name": "Home Desktop",
        "os": "windows",
        "arch": "amd64",
        "lastSeen": "2026-02-17T12:05:00.000Z",
        "createdAt": "2026-02-17T12:00:00.000Z",
        "isOnline": true,
        "lastMetric": {
          "cpuOverall": 45.2,
          "ramUsed": 8589934592,
          "ramTotal": 17179869184
        }
      }
    ]
  }
}
```

> **Note:** The `machineToken` is intentionally **omitted** from list responses. The `isOnline` flag is `true` if `lastSeen` is within the last 2 minutes.

#### Error Responses

| Status | Body                        | Cause                  |
| ------ | --------------------------- | ---------------------- |
| `401`  | `{"error": "Unauthorized"}` | Missing or invalid JWT |

---

### `POST /api/machines`

Register a new machine. Returns the machine record **including the machine token** (shown only once).

**Authentication:** JWT cookie

#### Request Body

```typescript
{
  name: string;    // 1–255 chars, required
  os?: string;     // Optional, max 50 chars (e.g., "windows", "linux", "darwin")
  arch?: string;   // Optional, max 50 chars (e.g., "amd64", "arm64")
}
```

#### Example Request

```bash
curl -X POST https://your-app.vercel.app/api/machines \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name": "Home Desktop", "os": "windows", "arch": "amd64"}'
```

#### Success Response — `201 Created`

```json
{
  "data": {
    "machine": {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "userId": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Home Desktop",
      "machineToken": "mtoken_f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "os": "windows",
      "arch": "amd64",
      "lastSeen": null,
      "createdAt": "2026-02-17T12:00:00.000Z"
    }
  }
}
```

> **Important:** The `machineToken` is returned **only in this response**. Save it immediately — it cannot be retrieved again. Use it to configure the Go agent.

#### Error Responses

| Status | Body                                  | Cause                  |
| ------ | ------------------------------------- | ---------------------- |
| `401`  | `{"error": "Unauthorized"}`           | Missing or invalid JWT |
| `422`  | `{"error": "Validation failed", ...}` | Invalid input          |

---

### `GET /api/machines/[id]`

Get details for a specific machine. Requires ownership or shared access.

**Authentication:** JWT cookie

#### Example Request

```bash
curl https://your-app.vercel.app/api/machines/a1b2c3d4-e5f6-7890-abcd-ef1234567890 \
  -b cookies.txt
```

#### Success Response — `200 OK`

```json
{
  "data": {
    "machine": {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "userId": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Home Desktop",
      "os": "windows",
      "arch": "amd64",
      "lastSeen": "2026-02-17T12:05:00.000Z",
      "createdAt": "2026-02-17T12:00:00.000Z"
    }
  }
}
```

> **Note:** The `machineToken` is **stripped** from GET responses for security (see [`route.ts:50`](web/src/app/api/machines/[id]/route.ts:50)).

#### Error Responses

| Status | Body                             | Cause                   |
| ------ | -------------------------------- | ----------------------- |
| `401`  | `{"error": "Unauthorized"}`      | Missing or invalid JWT  |
| `404`  | `{"error": "Machine not found"}` | Invalid ID or no access |

---

### `PUT /api/machines/[id]`

Update machine settings. **Owner only.**

**Authentication:** JWT cookie (owner)

#### Request Body

```typescript
{
  name?: string;   // 1–255 chars, optional
}
```

#### Example Request

```bash
curl -X PUT https://your-app.vercel.app/api/machines/a1b2c3d4-e5f6-7890-abcd-ef1234567890 \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name": "Gaming PC"}'
```

#### Success Response — `200 OK`

```json
{
  "data": {
    "machine": {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "userId": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Gaming PC",
      "os": "windows",
      "arch": "amd64",
      "lastSeen": "2026-02-17T12:05:00.000Z",
      "createdAt": "2026-02-17T12:00:00.000Z"
    }
  }
}
```

#### Error Responses

| Status | Body                                                  | Cause                  |
| ------ | ----------------------------------------------------- | ---------------------- |
| `400`  | `{"error": "No fields to update"}`                    | Empty update body      |
| `401`  | `{"error": "Unauthorized"}`                           | Missing or invalid JWT |
| `403`  | `{"error": "Only the owner can update this machine"}` | Not the machine owner  |
| `404`  | `{"error": "Machine not found"}`                      | Invalid machine ID     |
| `422`  | `{"error": "Validation failed", ...}`                 | Invalid input          |

---

### `DELETE /api/machines/[id]`

Delete a machine and all associated data (metrics, process snapshots, access grants). **Owner only.** Deletion cascades to all related records.

**Authentication:** JWT cookie (owner)

#### Example Request

```bash
curl -X DELETE https://your-app.vercel.app/api/machines/a1b2c3d4-e5f6-7890-abcd-ef1234567890 \
  -b cookies.txt
```

#### Success Response — `200 OK`

```json
{
  "data": {
    "deleted": true
  }
}
```

#### Error Responses

| Status | Body                                                  | Cause                  |
| ------ | ----------------------------------------------------- | ---------------------- |
| `401`  | `{"error": "Unauthorized"}`                           | Missing or invalid JWT |
| `403`  | `{"error": "Only the owner can delete this machine"}` | Not the machine owner  |
| `404`  | `{"error": "Machine not found"}`                      | Invalid machine ID     |

---

### `GET /api/machines/[id]/metrics`

Query time-series metrics for a specific machine. Supports three resolution levels: `raw`, `hourly`, and `daily`.

**Source:** [`web/src/app/api/machines/[id]/metrics/route.ts`](web/src/app/api/machines/[id]/metrics/route.ts)

**Authentication:** JWT cookie (owner or shared access)

#### Query Parameters

| Parameter           | Type     | Required | Default | Description                                           |
| ------------------- | -------- | -------- | ------- | ----------------------------------------------------- |
| `from`              | `string` | **Yes**  | —       | Start time (ISO 8601 datetime)                        |
| `to`                | `string` | **Yes**  | —       | End time (ISO 8601 datetime)                          |
| `resolution`        | `string` | No       | `raw`   | One of: `raw`, `hourly`, `daily`                      |
| `include_processes` | `string` | No       | `false` | Set to `true` to include process snapshots (raw only) |

#### Resolution Limits

| Resolution | Max Range | Max Results | Data Source                                                          |
| ---------- | --------- | ----------- | -------------------------------------------------------------------- |
| `raw`      | 24 hours  | 1,000       | [`metrics`](web/src/lib/db/migrations/0000_initial.sql) table        |
| `hourly`   | —         | 720         | [`metrics_hourly`](web/src/lib/db/migrations/0000_initial.sql) table |
| `daily`    | —         | 365         | [`metrics_daily`](web/src/lib/db/migrations/0000_initial.sql) table  |

#### Example Request

```bash
curl "https://your-app.vercel.app/api/machines/a1b2c3d4/metrics?from=2026-02-17T00:00:00Z&to=2026-02-17T12:00:00Z&resolution=raw&include_processes=true" \
  -b cookies.txt
```

#### Success Response — `200 OK` (raw)

```json
{
  "data": {
    "metrics": [
      {
        "id": "metric-uuid",
        "machineId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "timestamp": "2026-02-17T12:05:00.000Z",
        "cpuOverall": 45.2,
        "cpuCores": [23.1, 67.8, 12.4, 89.0],
        "ramUsed": 8589934592,
        "ramTotal": 17179869184,
        "diskUsage": [{ "mount": "C:", "total": 512110190592, "used": 234881024000, "free": 277229166592 }],
        "networkRx": 1048576,
        "networkTx": 524288,
        "uptimeSeconds": 86400,
        "cpuTemp": 65.0,
        "gpuTemp": 72.0,
        "processes": [
          { "pid": 1234, "name": "chrome.exe", "cpu": 12.5, "memory": 524288000, "status": "running" },
          { "pid": 5678, "name": "code.exe", "cpu": 8.3, "memory": 314572800, "status": "running" }
        ]
      }
    ],
    "resolution": "raw",
    "count": 1
  }
}
```

#### Success Response — `200 OK` (hourly)

```json
{
  "data": {
    "metrics": [
      {
        "id": "hourly-uuid",
        "machineId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "hour": "2026-02-17T12:00:00.000Z",
        "cpuAvg": 42.5,
        "cpuMax": 95.3,
        "ramAvg": 8200000000,
        "ramMax": 9100000000,
        "networkRxTotal": 104857600,
        "networkTxTotal": 52428800,
        "sampleCount": 240
      }
    ],
    "resolution": "hourly",
    "count": 1
  }
}
```

#### Error Responses

| Status | Body                                                   | Cause                          |
| ------ | ------------------------------------------------------ | ------------------------------ |
| `400`  | `{"error": "Invalid query parameters..."}`             | Missing or invalid `from`/`to` |
| `400`  | `{"error": "'from' must be before 'to'"}`              | Invalid time range             |
| `400`  | `{"error": "Raw resolution limited to 24-hour range"}` | Range exceeds 24h for raw      |
| `401`  | `{"error": "Unauthorized"}`                            | Missing or invalid JWT         |
| `403`  | `{"error": "Access denied"}`                           | No ownership or shared access  |
| `404`  | `{"error": "Machine not found"}`                       | Invalid machine ID             |

---

## Ingestion

### `POST /api/ingest`

Metric ingestion endpoint for Go agents. Accepts gzip-compressed JSON batches authenticated via machine token.

**Source:** [`web/src/app/api/ingest/route.ts`](web/src/app/api/ingest/route.ts)

**Authentication:** Machine token via `Authorization: Bearer <token>` header (preferred) or `machine_token` field in request body (legacy)

**Rate Limit:** 10 requests per minute per machine

#### Request Headers

| Header             | Required | Value                    |
| ------------------ | -------- | ------------------------ |
| `Content-Type`     | Yes      | `application/json`       |
| `Content-Encoding` | No       | `gzip` (recommended)     |
| `Authorization`    | Yes\*    | `Bearer <machine_token>` |

\*The token can alternatively be included in the request body as `machine_token` for backward compatibility.

#### Request Body

```typescript
{
  machine_token?: string;  // Optional if using Authorization header
  metrics: Array<{
    timestamp: string;       // ISO 8601 datetime
    cpu_overall: number;     // 0–100
    cpu_cores: number[];     // Per-core usage (0–100), max 256 cores
    ram_used: number;        // Bytes (non-negative integer)
    ram_total: number;       // Bytes (positive integer)
    disk_usage: Array<{
      mount: string;         // Mount point (e.g., "C:", "/")
      total: number;         // Total bytes
      used: number;          // Used bytes
      free: number;          // Free bytes
    }>;                      // Max 50 disks
    network_rx: number;      // Received bytes (non-negative integer)
    network_tx: number;      // Transmitted bytes (non-negative integer)
    uptime_seconds: number;  // Seconds since boot (non-negative integer)
    cpu_temp?: number | null;  // Celsius (optional)
    gpu_temp?: number | null;  // Celsius (optional)
    processes: Array<{
      pid: number;           // Process ID
      name: string;          // Process name, max 255 chars
      cpu: number;           // CPU usage 0–100
      memory: number;        // Memory bytes
      status: string;        // Process status, max 50 chars
    }>;                      // Max 50 processes
  }>;                        // Min 1, max 120 metrics per batch
}
```

Validation is defined in [`web/src/lib/validation/metrics.ts`](web/src/lib/validation/metrics.ts).

#### Example Request

```bash
curl -X POST https://your-app.vercel.app/api/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mtoken_your-machine-token" \
  -d '{
    "metrics": [{
      "timestamp": "2026-02-17T12:05:00Z",
      "cpu_overall": 45.2,
      "cpu_cores": [23.1, 67.8, 12.4, 89.0],
      "ram_used": 8589934592,
      "ram_total": 17179869184,
      "disk_usage": [{"mount": "C:", "total": 512110190592, "used": 234881024000, "free": 277229166592}],
      "network_rx": 1048576,
      "network_tx": 524288,
      "uptime_seconds": 86400,
      "cpu_temp": 65.0,
      "gpu_temp": null,
      "processes": [
        {"pid": 1234, "name": "chrome.exe", "cpu": 12.5, "memory": 524288000, "status": "running"}
      ]
    }]
  }'
```

#### Success Response — `201 Created`

```json
{
  "data": {
    "inserted": 1
  }
}
```

#### Error Responses

| Status | Body                                     | Cause                               |
| ------ | ---------------------------------------- | ----------------------------------- |
| `401`  | `{"error": "Machine token is required"}` | No token in header or body          |
| `401`  | `{"error": "Invalid machine token"}`     | Token doesn't match any machine     |
| `422`  | `{"error": "Invalid payload"}`           | Zod validation failed               |
| `429`  | `{"error": "Rate limit exceeded"}`       | Too many requests from this machine |
| `500`  | `{"error": "Internal server error"}`     | Database or server error            |

---

## Admin

### `GET/POST /api/admin/cleanup`

Data retention cleanup and aggregation job. Aggregates raw metrics into hourly and daily rollups, then deletes expired data.

**Source:** [`web/src/app/api/admin/cleanup/route.ts`](web/src/app/api/admin/cleanup/route.ts)

**Authentication:** `Authorization: Bearer <CRON_SECRET>` header

**Trigger:** Vercel Cron (daily at 3:00 AM UTC) or manual invocation

#### What It Does

1. **Aggregate** raw metrics older than 24 hours into `metrics_hourly` (idempotent upsert)
2. **Aggregate** hourly metrics older than 7 days into `metrics_daily` (idempotent upsert)
3. **Delete** raw metrics older than 7 days
4. **Delete** orphaned process snapshots
5. **Delete** hourly metrics older than 30 days
6. **Delete** daily metrics older than 1 year

#### Example Request

```bash
curl -X POST https://your-app.vercel.app/api/admin/cleanup \
  -H "Authorization: Bearer your-cron-secret"
```

#### Success Response — `200 OK`

```json
{
  "data": {
    "summary": {
      "hourlyAggregated": 24,
      "dailyAggregated": 7,
      "rawMetricsDeleted": 8640,
      "orphanedSnapshotsDeleted": 0,
      "hourlyMetricsDeleted": 0,
      "dailyMetricsDeleted": 0
    },
    "completedAt": "2026-02-17T03:00:05.123Z"
  }
}
```

#### Error Responses

| Status | Body                                 | Cause                            |
| ------ | ------------------------------------ | -------------------------------- |
| `401`  | `{"error": "Unauthorized"}`          | Missing or invalid `CRON_SECRET` |
| `500`  | `{"error": "Internal server error"}` | Database error during cleanup    |

---

## Common Response Format

All API responses follow a consistent JSON structure.

### Success Response

```json
{
  "data": {
    // Response payload
  }
}
```

### Error Response

```json
{
  "error": "Human-readable error message"
}
```

### Validation Error Response

```json
{
  "error": "Validation failed",
  "fields": {
    "email": ["Invalid email address"],
    "password": ["Must contain at least one uppercase letter"]
  }
}
```

---

## Error Codes

| HTTP Status | Meaning               | Common Causes                                      |
| ----------- | --------------------- | -------------------------------------------------- |
| `200`       | OK                    | Request succeeded                                  |
| `201`       | Created               | Resource created (registration, machine, metrics)  |
| `400`       | Bad Request           | Invalid parameters, empty update                   |
| `401`       | Unauthorized          | Missing/invalid JWT, machine token, or cron secret |
| `403`       | Forbidden             | Insufficient permissions (not owner, wrong role)   |
| `404`       | Not Found             | Resource doesn't exist or no access                |
| `409`       | Conflict              | Email already registered                           |
| `422`       | Unprocessable Entity  | Zod validation failed                              |
| `429`       | Too Many Requests     | Rate limit exceeded                                |
| `500`       | Internal Server Error | Unexpected server error                            |

---

## Rate Limits

Rate limits are enforced per-endpoint to prevent abuse. The current implementation uses in-memory rate limiting (per serverless isolate).

| Endpoint Category     | Limit                     | Key        | Window       |
| --------------------- | ------------------------- | ---------- | ------------ |
| Auth (login/register) | 10 requests               | IP address | 15 min       |
| Ingestion             | 10 requests               | Machine ID | 1 min        |
| General API           | Configurable via env vars | Varies     | Configurable |

When rate limited, the API returns `429 Too Many Requests`. The Go agent automatically handles this by buffering metrics locally and retrying later.

### Configuration

Rate limit defaults can be overridden via environment variables in [`.env.example`](.env.example):

```env
RATE_LIMIT_WINDOW_MS=60000      # Window in milliseconds (default: 60s)
RATE_LIMIT_MAX_REQUESTS=10      # Max requests per window (default: 10)
```
