// Integration tests for machines API routes:
//   GET  /api/machines — list machines (auth required)
//   POST /api/machines — create machine (auth required)

import { NextRequest } from "next/server";
import { createAccessToken } from "@/lib/auth/jwt";

// ---------------------------------------------------------------------------
// Mocks — declared before route imports
// ---------------------------------------------------------------------------

/** Builds a chainable mock DB that mimics Drizzle's fluent API. */
function createMockDb() {
  // --- INSERT chain ---
  const mockReturning = jest.fn().mockResolvedValue([
    {
      id: "machine-1",
      userId: "user-1",
      name: "Test Machine",
      machineToken: "mtoken_generated",
      os: "linux",
      arch: "x86_64",
      lastSeen: null,
      createdAt: new Date().toISOString(),
    },
  ]);
  const mockInsertValues = jest.fn().mockReturnValue({ returning: mockReturning });
  const mockInsert = jest.fn().mockReturnValue({ values: mockInsertValues });

  // --- SELECT chain (supports orderBy for metrics query) ---
  const mockLimit = jest.fn().mockResolvedValue([]);
  const mockOrderBy = jest.fn().mockReturnValue({ limit: mockLimit });
  const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit, orderBy: mockOrderBy });
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
      mockOrderBy,
      mockInsert,
      mockInsertValues,
      mockReturning,
      mockUpdate,
      mockUpdateSet,
      mockUpdateWhere,
    },
  };
}

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

// Import route handlers after mocks
import { GET, POST } from "@/app/api/machines/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a valid access token for testing authenticated routes. */
async function createTestAccessToken(overrides: Partial<{ sub: string; email: string; role: string }> = {}) {
  return createAccessToken({
    sub: overrides.sub ?? "user-1",
    email: overrides.email ?? "test@example.com",
    role: overrides.role ?? "USER",
  });
}

/** Build a NextRequest with auth cookie and optional JSON body. */
async function authenticatedRequest(url: string, method: string, body?: unknown, tokenOverrides?: Partial<{ sub: string; email: string; role: string }>) {
  const token = await createTestAccessToken(tokenOverrides);

  let req: NextRequest;
  if (body !== undefined) {
    req = new NextRequest(url, {
      method,
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  } else {
    req = new NextRequest(url, { method });
  }

  req.cookies.set("access_token", token);
  return req;
}

/** Reset all mock return values to sensible defaults. */
function resetMockDefaults() {
  // INSERT chain
  mockDb._mocks.mockReturning.mockResolvedValue([
    {
      id: "machine-1",
      userId: "user-1",
      name: "Test Machine",
      machineToken: "mtoken_generated",
      os: "linux",
      arch: "x86_64",
      lastSeen: null,
      createdAt: new Date().toISOString(),
    },
  ]);
  mockDb._mocks.mockInsertValues.mockReturnValue({ returning: mockDb._mocks.mockReturning });
  mockDb._mocks.mockInsert.mockReturnValue({ values: mockDb._mocks.mockInsertValues });

  // SELECT chain — default: empty results
  mockDb._mocks.mockLimit.mockResolvedValue([]);
  mockDb._mocks.mockOrderBy.mockReturnValue({ limit: mockDb._mocks.mockLimit });
  mockDb._mocks.mockWhere.mockReturnValue({
    limit: mockDb._mocks.mockLimit,
    orderBy: mockDb._mocks.mockOrderBy,
  });
  mockDb._mocks.mockFrom.mockReturnValue({ where: mockDb._mocks.mockWhere });
  mockDb._mocks.mockSelect.mockReturnValue({ from: mockDb._mocks.mockFrom });

  // UPDATE chain
  mockDb._mocks.mockUpdateWhere.mockResolvedValue(undefined);
  mockDb._mocks.mockUpdateSet.mockReturnValue({ where: mockDb._mocks.mockUpdateWhere });
  mockDb._mocks.mockUpdate.mockReturnValue({ set: mockDb._mocks.mockUpdateSet });
}

// ---------------------------------------------------------------------------
// POST /api/machines tests
// ---------------------------------------------------------------------------

describe("POST /api/machines", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockDefaults();
  });

  it("returns 401 without access_token cookie", async () => {
    const req = new NextRequest("http://localhost/api/machines", {
      method: "POST",
      body: JSON.stringify({ name: "My Server" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error).toBe("Authentication required");
  });

  it("returns 201 with machine data for valid creation", async () => {
    const req = await authenticatedRequest("http://localhost/api/machines", "POST", {
      name: "My Server",
      os: "linux",
      arch: "x86_64",
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.machine).toBeDefined();
    expect(json.data.machine.name).toBe("Test Machine");
    expect(json.data.machine.machineToken).toBeDefined();
    expect(json.data.machine.machineToken).toContain("mtoken_");
  });

  it("returns 422 for missing name", async () => {
    const req = await authenticatedRequest("http://localhost/api/machines", "POST", {
      os: "linux",
    });

    const res = await POST(req);
    expect(res.status).toBe(422);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("Validation failed");
  });

  it("returns 422 for empty name", async () => {
    const req = await authenticatedRequest("http://localhost/api/machines", "POST", {
      name: "",
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("creates machine with optional fields omitted", async () => {
    const req = await authenticatedRequest("http://localhost/api/machines", "POST", {
      name: "Minimal Machine",
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    // Verify insert was called
    expect(mockDb._mocks.mockInsert).toHaveBeenCalled();
  });

  it("passes user ID from JWT to machine creation", async () => {
    const req = await authenticatedRequest("http://localhost/api/machines", "POST", { name: "User Machine" }, { sub: "specific-user-id" });

    await POST(req);

    // Verify insert values were called (the handler passes userId from JWT)
    expect(mockDb._mocks.mockInsertValues).toHaveBeenCalled();
    const insertCall = mockDb._mocks.mockInsertValues.mock.calls[0][0];
    expect(insertCall.userId).toBe("specific-user-id");
  });
});

// ---------------------------------------------------------------------------
// GET /api/machines tests
// ---------------------------------------------------------------------------

describe("GET /api/machines", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockDefaults();
  });

  it("returns 401 without access_token cookie", async () => {
    const req = new NextRequest("http://localhost/api/machines", {
      method: "GET",
    });

    const res = await GET(req);
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error).toBe("Authentication required");
  });

  it("returns 200 with empty machines list when user has no machines", async () => {
    // Both owned and shared queries return empty
    // The GET handler calls:
    //   db.select().from(machines).where(eq(machines.userId, user.sub))  → awaited directly (thenable)
    //   db.select({ machineId: ... }).from(machineAccess).where(...)     → awaited directly
    const emptyPromise = Promise.resolve([]);
    mockDb._mocks.mockWhere
      .mockReturnValueOnce(emptyPromise) // owned machines
      .mockReturnValueOnce(emptyPromise); // shared access

    const token = await createTestAccessToken();
    const req = new NextRequest("http://localhost/api/machines", { method: "GET" });
    req.cookies.set("access_token", token);

    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.machines).toEqual([]);
  });

  it("returns 200 with machines list when user has machines", async () => {
    const machineData = {
      id: "machine-1",
      userId: "user-1",
      name: "My Server",
      machineToken: "mtoken_abc",
      os: "linux",
      arch: "x86_64",
      lastSeen: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    // First where: owned machines → returns array with machine
    // Second where: shared access → returns empty
    // Third where (inside enrichment): latest metric → needs orderBy chain
    const mockMetricLimit = jest.fn().mockResolvedValue([]);
    const mockMetricOrderBy = jest.fn().mockReturnValue({ limit: mockMetricLimit });

    mockDb._mocks.mockWhere
      .mockReturnValueOnce(Promise.resolve([machineData])) // owned machines
      .mockReturnValueOnce(Promise.resolve([])) // shared access
      .mockReturnValueOnce({ orderBy: mockMetricOrderBy }); // latest metric query

    const token = await createTestAccessToken();
    const req = new NextRequest("http://localhost/api/machines", { method: "GET" });
    req.cookies.set("access_token", token);

    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.machines).toHaveLength(1);
    expect(json.data.machines[0].name).toBe("My Server");
    expect(json.data.machines[0]).toHaveProperty("isOnline");
  });
});
