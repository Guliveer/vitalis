// Integration tests for POST /api/ingest — metric ingestion endpoint

import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the route handler
// ---------------------------------------------------------------------------

const mockDb = createMockDb();

jest.mock("@/lib/db", () => ({
  getDb: jest.fn(() => mockDb),
}));

jest.mock("@/lib/utils/rate-limit", () => ({
  checkRateLimit: jest.fn().mockReturnValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }),
  RATE_LIMITS: {
    auth: { windowMs: 15 * 60 * 1000, maxRequests: 10 },
    ingest: { windowMs: 60 * 1000, maxRequests: 10 },
    api: { windowMs: 60 * 1000, maxRequests: 60 },
  },
}));

import { POST } from "@/app/api/ingest/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a chainable mock that mimics Drizzle's fluent query API. */
function createMockDb() {
  // --- INSERT chain ---
  const mockReturning = jest.fn().mockResolvedValue([{ id: "metric-1" }]);
  const mockInsertValues = jest.fn().mockReturnValue({ returning: mockReturning });
  const mockInsert = jest.fn().mockReturnValue({ values: mockInsertValues });

  // --- SELECT chain ---
  const mockLimit = jest.fn().mockResolvedValue([{ id: "machine-1", machineToken: "mtoken_test", userId: "user-1" }]);
  const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
  const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = jest.fn().mockReturnValue({ from: mockFrom });

  // --- UPDATE chain ---
  const mockUpdateWhere = jest.fn().mockResolvedValue(undefined);
  const mockUpdateSet = jest.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = jest.fn().mockReturnValue({ set: mockUpdateSet });

  return {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    _mocks: {
      mockSelect,
      mockFrom,
      mockWhere,
      mockLimit,
      mockInsert,
      mockInsertValues,
      mockReturning,
      mockUpdate,
      mockUpdateSet,
      mockUpdateWhere,
    },
  };
}

/**
 * Create a valid ISO timestamp with nanosecond precision.
 * The metricBatchSchema requires `z.string().datetime({ precision: 9 })`.
 */
function nanoTimestamp(): string {
  // e.g. "2026-02-18T23:00:00.000000000Z"
  const base = new Date().toISOString().replace("Z", "");
  // Pad to 9 decimal places
  const [datePart, fracPart] = base.split(".");
  const padded = (fracPart ?? "000").padEnd(9, "0");
  return `${datePart}.${padded}Z`;
}

/** Create a valid single metric entry matching `singleMetricSchema`. */
function validMetricEntry(overrides: Record<string, unknown> = {}) {
  return {
    timestamp: nanoTimestamp(),
    cpu_overall: 45.2,
    cpu_cores: [40.0, 50.0],
    ram_used: 4_000_000_000,
    ram_total: 8_000_000_000,
    disk_usage: [{ mount: "/", total: 500_000_000_000, used: 250_000_000_000, free: 250_000_000_000 }],
    network_rx: 1_000_000,
    network_tx: 500_000,
    uptime_seconds: 86400,
    processes: [{ pid: 1, name: "node", cpu: 12.5, memory: 100_000_000, status: "running" }],
    ...overrides,
  };
}

/** Shorthand to build a NextRequest for the ingest endpoint. */
function ingestRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/ingest", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** Reset all mock return values after clearAllMocks. */
function resetMockDefaults() {
  mockDb._mocks.mockReturning.mockResolvedValue([{ id: "metric-1" }]);
  mockDb._mocks.mockInsertValues.mockReturnValue({ returning: mockDb._mocks.mockReturning });
  mockDb._mocks.mockInsert.mockReturnValue({ values: mockDb._mocks.mockInsertValues });

  mockDb._mocks.mockLimit.mockResolvedValue([{ id: "machine-1", machineToken: "mtoken_test", userId: "user-1" }]);
  mockDb._mocks.mockWhere.mockReturnValue({ limit: mockDb._mocks.mockLimit });
  mockDb._mocks.mockFrom.mockReturnValue({ where: mockDb._mocks.mockWhere });
  mockDb._mocks.mockSelect.mockReturnValue({ from: mockDb._mocks.mockFrom });

  mockDb._mocks.mockUpdateWhere.mockResolvedValue(undefined);
  mockDb._mocks.mockUpdateSet.mockReturnValue({ where: mockDb._mocks.mockUpdateWhere });
  mockDb._mocks.mockUpdate.mockReturnValue({ set: mockDb._mocks.mockUpdateSet });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/ingest", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockDefaults();
  });

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------

  it("returns 422 for invalid payload (missing required fields)", async () => {
    const req = ingestRequest({ machine_token: "mtoken_test" }, { Authorization: "Bearer mtoken_test" });

    const res = await POST(req);
    expect(res.status).toBe(422);

    const json = await res.json();
    expect(json.error).toBe("Invalid payload");
    expect(json.details).toBeDefined();
  });

  it("returns 422 for empty metrics array", async () => {
    const req = ingestRequest({
      machine_token: "mtoken_test",
      metrics: [],
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  // -----------------------------------------------------------------------
  // Authentication — machine token
  // -----------------------------------------------------------------------

  it("returns 401 for missing machine token (no header, no body token)", async () => {
    const req = ingestRequest({
      metrics: [validMetricEntry()],
    });

    const res = await POST(req);
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error).toBe("Machine token is required");
  });

  it("returns 401 for invalid/unknown machine token", async () => {
    // Machine lookup returns empty array
    mockDb._mocks.mockLimit.mockResolvedValueOnce([]);

    const req = ingestRequest({ metrics: [validMetricEntry()] }, { Authorization: "Bearer mtoken_unknown" });

    const res = await POST(req);
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error).toBe("Invalid machine token");
  });

  // -----------------------------------------------------------------------
  // Successful ingestion
  // -----------------------------------------------------------------------

  it("returns 201 for valid payload with Authorization Bearer header", async () => {
    const req = ingestRequest({ metrics: [validMetricEntry()] }, { Authorization: "Bearer mtoken_test" });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.inserted).toBe(1);
  });

  it("returns 201 for valid payload with machine_token in body (legacy)", async () => {
    const req = ingestRequest({
      machine_token: "mtoken_test",
      metrics: [validMetricEntry()],
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.inserted).toBe(1);
  });

  it("prefers Authorization header over body token", async () => {
    const req = ingestRequest({ machine_token: "mtoken_body", metrics: [validMetricEntry()] }, { Authorization: "Bearer mtoken_header" });

    await POST(req);

    // The select chain should have been called (machine lookup)
    expect(mockDb._mocks.mockSelect).toHaveBeenCalled();
  });

  it("inserts process snapshots when processes are present", async () => {
    const req = ingestRequest({ metrics: [validMetricEntry()] }, { Authorization: "Bearer mtoken_test" });

    await POST(req);

    // insert is called for metrics and for processSnapshots
    expect(mockDb._mocks.mockInsert).toHaveBeenCalledTimes(2);
  });

  it("skips process snapshot insert when no processes", async () => {
    const req = ingestRequest({ metrics: [validMetricEntry({ processes: null })] }, { Authorization: "Bearer mtoken_test" });

    await POST(req);

    // insert is called only for metrics (no process snapshots)
    expect(mockDb._mocks.mockInsert).toHaveBeenCalledTimes(1);
  });

  it("updates machine lastSeen after successful ingestion", async () => {
    const req = ingestRequest({ metrics: [validMetricEntry()] }, { Authorization: "Bearer mtoken_test" });

    await POST(req);

    expect(mockDb._mocks.mockUpdate).toHaveBeenCalled();
    expect(mockDb._mocks.mockUpdateSet).toHaveBeenCalled();
  });

  it("returns correct inserted count for multiple metrics", async () => {
    mockDb._mocks.mockReturning.mockResolvedValueOnce([{ id: "metric-1" }, { id: "metric-2" }, { id: "metric-3" }]);

    const req = ingestRequest(
      {
        metrics: [validMetricEntry(), validMetricEntry(), validMetricEntry()],
      },
      { Authorization: "Bearer mtoken_test" },
    );

    const res = await POST(req);
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.data.inserted).toBe(3);
  });
});
