// Integration tests for auth API routes:
//   POST /api/auth/register
//   POST /api/auth/login
//   POST /api/auth/logout
//   POST /api/auth/refresh

import { NextRequest } from "next/server";
import { createRefreshToken } from "@/lib/auth/jwt";
import { hashPassword } from "@/lib/auth/password";

// ---------------------------------------------------------------------------
// Mocks — declared before route imports
// ---------------------------------------------------------------------------

/**
 * Builds a chainable mock DB that mimics Drizzle's fluent API.
 *
 * The register route uses two different chain patterns:
 *   1. db.select({...}).from(users).where(...).limit(1)  — email check
 *   2. db.select({...}).from(users).limit(1)             — user count (no where!)
 *
 * To handle both, mockFrom returns an object with both `where` and `limit`.
 */
function createMockDb() {
  // --- INSERT chain ---
  const mockReturning = jest.fn();
  const mockInsertValues = jest.fn().mockReturnValue({ returning: mockReturning });
  const mockInsert = jest.fn().mockReturnValue({ values: mockInsertValues });

  // --- SELECT chain ---
  const mockLimit = jest.fn();
  const mockWhere = jest.fn().mockReturnValue({ limit: mockLimit });
  const mockFrom = jest.fn().mockReturnValue({ where: mockWhere, limit: mockLimit });
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
import { POST as registerPOST } from "@/app/api/auth/register/route";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { POST as logoutPOST } from "@/app/api/auth/logout/route";
import { POST as refreshPOST } from "@/app/api/auth/refresh/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

/** Reset all mock return values to sensible defaults. */
function resetMockDefaults() {
  // INSERT chain
  mockDb._mocks.mockReturning.mockResolvedValue([
    {
      id: "user-1",
      email: "new@example.com",
      role: "ADMIN",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);
  mockDb._mocks.mockInsertValues.mockReturnValue({ returning: mockDb._mocks.mockReturning });
  mockDb._mocks.mockInsert.mockReturnValue({ values: mockDb._mocks.mockInsertValues });

  // SELECT chain — default: empty results (no existing user)
  mockDb._mocks.mockLimit.mockResolvedValue([]);
  mockDb._mocks.mockWhere.mockReturnValue({ limit: mockDb._mocks.mockLimit });
  mockDb._mocks.mockFrom.mockReturnValue({ where: mockDb._mocks.mockWhere, limit: mockDb._mocks.mockLimit });
  mockDb._mocks.mockSelect.mockReturnValue({ from: mockDb._mocks.mockFrom });

  // UPDATE chain
  mockDb._mocks.mockUpdateWhere.mockResolvedValue(undefined);
  mockDb._mocks.mockUpdateSet.mockReturnValue({ where: mockDb._mocks.mockUpdateWhere });
  mockDb._mocks.mockUpdate.mockReturnValue({ set: mockDb._mocks.mockUpdateSet });
}

// ---------------------------------------------------------------------------
// Register tests
// ---------------------------------------------------------------------------

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockDefaults();
  });

  it("returns 201 with cookies for valid registration (first user = ADMIN)", async () => {
    // Register does 3 DB calls:
    //   1. db.select({id}).from(users).where(eq(email)).limit(1) → email check → []
    //   2. db.select({id}).from(users).limit(1)                  → user count → []
    //   3. db.insert(users).values({...}).returning({...})        → insert
    //
    // Both #1 and #2 go through mockLimit. We use mockResolvedValueOnce for each.
    mockDb._mocks.mockLimit
      .mockResolvedValueOnce([]) // email check → not found
      .mockResolvedValueOnce([]); // user count → no users (first user = ADMIN)

    const req = jsonRequest("http://localhost/api/auth/register", {
      email: "new@example.com",
      password: "StrongPass1",
    });

    const res = await registerPOST(req);
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.user).toBeDefined();
    expect(json.data.user.id).toBe("user-1");

    // Check that auth cookies are set
    const cookies = res.cookies.getAll();
    const cookieNames = cookies.map((c) => c.name);
    expect(cookieNames).toContain("access_token");
    expect(cookieNames).toContain("refresh_token");
  });

  it("returns 422 for invalid email", async () => {
    const req = jsonRequest("http://localhost/api/auth/register", {
      email: "not-an-email",
      password: "StrongPass1",
    });

    const res = await registerPOST(req);
    expect(res.status).toBe(422);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("Validation failed");
  });

  it("returns 422 for weak password (no uppercase)", async () => {
    const req = jsonRequest("http://localhost/api/auth/register", {
      email: "test@example.com",
      password: "weakpass1",
    });

    const res = await registerPOST(req);
    expect(res.status).toBe(422);
  });

  it("returns 422 for weak password (no number)", async () => {
    const req = jsonRequest("http://localhost/api/auth/register", {
      email: "test@example.com",
      password: "WeakPassword",
    });

    const res = await registerPOST(req);
    expect(res.status).toBe(422);
  });

  it("returns 422 for short password", async () => {
    const req = jsonRequest("http://localhost/api/auth/register", {
      email: "test@example.com",
      password: "Sh0rt",
    });

    const res = await registerPOST(req);
    expect(res.status).toBe(422);
  });

  it("returns 409 for duplicate email", async () => {
    // Email check returns existing user
    mockDb._mocks.mockLimit.mockResolvedValueOnce([{ id: "existing-user" }]);

    const req = jsonRequest("http://localhost/api/auth/register", {
      email: "existing@example.com",
      password: "StrongPass1",
    });

    const res = await registerPOST(req);
    expect(res.status).toBe(409);

    const json = await res.json();
    expect(json.error).toContain("already exists");
  });

  it("assigns USER role when other users exist", async () => {
    // Email check → not found, user count → has users
    mockDb._mocks.mockLimit
      .mockResolvedValueOnce([]) // email check
      .mockResolvedValueOnce([{ id: "other-user" }]); // user count → not first user

    mockDb._mocks.mockReturning.mockResolvedValueOnce([
      {
        id: "user-2",
        email: "second@example.com",
        role: "USER",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    const req = jsonRequest("http://localhost/api/auth/register", {
      email: "second@example.com",
      password: "StrongPass1",
    });

    const res = await registerPOST(req);
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.data.user.role).toBe("USER");
  });
});

// ---------------------------------------------------------------------------
// Login tests
// ---------------------------------------------------------------------------

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockDefaults();
  });

  it("returns 200 with cookies for valid credentials", async () => {
    const hashed = await hashPassword("StrongPass1");

    // Login does: db.select().from(users).where(eq(email)).limit(1)
    mockDb._mocks.mockLimit.mockResolvedValueOnce([
      {
        id: "user-1",
        email: "test@example.com",
        passwordHash: hashed,
        role: "USER",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    const req = jsonRequest("http://localhost/api/auth/login", {
      email: "test@example.com",
      password: "StrongPass1",
    });

    const res = await loginPOST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.user.email).toBe("test@example.com");

    // Check cookies
    const cookies = res.cookies.getAll();
    const cookieNames = cookies.map((c) => c.name);
    expect(cookieNames).toContain("access_token");
    expect(cookieNames).toContain("refresh_token");
  });

  it("returns 401 for non-existent user", async () => {
    // No user found
    mockDb._mocks.mockLimit.mockResolvedValueOnce([]);

    const req = jsonRequest("http://localhost/api/auth/login", {
      email: "nobody@example.com",
      password: "StrongPass1",
    });

    const res = await loginPOST(req);
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error).toBe("Invalid credentials");
  });

  it("returns 401 for wrong password", async () => {
    const hashed = await hashPassword("CorrectPass1");

    mockDb._mocks.mockLimit.mockResolvedValueOnce([
      {
        id: "user-1",
        email: "test@example.com",
        passwordHash: hashed,
        role: "USER",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    const req = jsonRequest("http://localhost/api/auth/login", {
      email: "test@example.com",
      password: "WrongPass1",
    });

    const res = await loginPOST(req);
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error).toBe("Invalid credentials");
  });

  it("returns 422 for invalid email format", async () => {
    const req = jsonRequest("http://localhost/api/auth/login", {
      email: "not-valid",
      password: "StrongPass1",
    });

    const res = await loginPOST(req);
    expect(res.status).toBe(422);
  });

  it("returns 422 for missing password", async () => {
    const req = jsonRequest("http://localhost/api/auth/login", {
      email: "test@example.com",
    });

    const res = await loginPOST(req);
    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// Logout tests
// ---------------------------------------------------------------------------

describe("POST /api/auth/logout", () => {
  it("returns 200 and clears cookies", async () => {
    const req = new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
    });

    const res = await logoutPOST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.message).toBe("Logged out successfully");

    // Verify cookies are cleared (maxAge = 0)
    const cookies = res.cookies.getAll();
    const accessCookie = cookies.find((c) => c.name === "access_token");
    const refreshCookie = cookies.find((c) => c.name === "refresh_token");
    expect(accessCookie).toBeDefined();
    expect(refreshCookie).toBeDefined();
    // Cleared cookies have empty value
    expect(accessCookie!.value).toBe("");
    expect(refreshCookie!.value).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Refresh tests
// ---------------------------------------------------------------------------

describe("POST /api/auth/refresh", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockDefaults();
  });

  it("returns 200 with new tokens for valid refresh token", async () => {
    // Create a real refresh token using the JWT utility (env vars set in setup.ts)
    const refreshToken = await createRefreshToken("user-1");

    // Mock user lookup: db.select({...}).from(users).where(...).limit(1)
    mockDb._mocks.mockLimit.mockResolvedValueOnce([
      {
        id: "user-1",
        email: "test@example.com",
        role: "USER",
      },
    ]);

    // Build request with refresh_token cookie via headers
    const req = new NextRequest("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": `refresh_token=${refreshToken}`,
      },
    });

    const res = await refreshPOST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);

    // New cookies should be set
    const cookies = res.cookies.getAll();
    const cookieNames = cookies.map((c) => c.name);
    expect(cookieNames).toContain("access_token");
    expect(cookieNames).toContain("refresh_token");
  });

  it("returns 401 when refresh_token cookie is missing", async () => {
    const req = new NextRequest("http://localhost/api/auth/refresh", {
      method: "POST",
    });

    const res = await refreshPOST(req);
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error).toBe("Refresh token required");
  });

  it("returns 401 for invalid refresh token", async () => {
    const req = new NextRequest("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: {
        Cookie: "refresh_token=invalid.token.value",
      },
    });

    const res = await refreshPOST(req);
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error).toBe("Invalid or expired refresh token");
  });

  it("returns 401 when user no longer exists", async () => {
    const refreshToken = await createRefreshToken("deleted-user");

    // User lookup returns empty
    mockDb._mocks.mockLimit.mockResolvedValueOnce([]);

    const req = new NextRequest("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: {
        Cookie: `refresh_token=${refreshToken}`,
      },
    });

    const res = await refreshPOST(req);
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error).toBe("User not found");
  });
});
