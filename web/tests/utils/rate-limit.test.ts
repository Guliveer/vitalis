import type { RateLimitConfig, RateLimitResult } from "@/lib/utils/rate-limit";

// We need fresh module state for each test since rate-limit uses a module-level Map store.
// jest.resetModules() + dynamic require ensures a clean store per test.

let checkRateLimit: (key: string, config: RateLimitConfig) => RateLimitResult;
let rateLimit: (key: string, options?: { windowMs?: number; maxRequests?: number }) => { success: boolean; retryAfter?: number };
let RATE_LIMITS: {
  auth: RateLimitConfig;
  ingest: RateLimitConfig;
  api: RateLimitConfig;
};

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();

  const mod = require("@/lib/utils/rate-limit");
  checkRateLimit = mod.checkRateLimit;
  rateLimit = mod.rateLimit;
  RATE_LIMITS = mod.RATE_LIMITS;
});

afterEach(() => {
  jest.useRealTimers();
});

const defaultConfig: RateLimitConfig = { windowMs: 60_000, maxRequests: 5 };

describe("checkRateLimit", () => {
  it("allows requests within the limit", () => {
    const result = checkRateLimit("user-1", defaultConfig);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("decrements remaining count on each request", () => {
    checkRateLimit("user-1", defaultConfig); // remaining: 4
    const result = checkRateLimit("user-1", defaultConfig); // remaining: 3
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(3);
  });

  it("blocks requests exceeding the limit", () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit("user-1", defaultConfig);
    }
    const result = checkRateLimit("user-1", defaultConfig);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("returns retryAfter when blocked", () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit("user-1", defaultConfig);
    }
    const result = checkRateLimit("user-1", defaultConfig);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeDefined();
    expect(typeof result.retryAfter).toBe("number");
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("resets after the window expires", () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit("user-1", defaultConfig);
    }
    // Blocked
    expect(checkRateLimit("user-1", defaultConfig).allowed).toBe(false);

    // Advance time past the window
    jest.advanceTimersByTime(60_001);

    // Should be allowed again
    const result = checkRateLimit("user-1", defaultConfig);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("tracks different keys independently", () => {
    // Exhaust limit for user-1
    for (let i = 0; i < 5; i++) {
      checkRateLimit("user-1", defaultConfig);
    }
    expect(checkRateLimit("user-1", defaultConfig).allowed).toBe(false);

    // user-2 should still be allowed
    const result = checkRateLimit("user-2", defaultConfig);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("returns correct remaining count", () => {
    const results: number[] = [];
    for (let i = 0; i < 5; i++) {
      results.push(checkRateLimit("user-1", defaultConfig).remaining);
    }
    expect(results).toEqual([4, 3, 2, 1, 0]);
  });

  it("returns a resetAt timestamp in the future", () => {
    const now = Date.now();
    const result = checkRateLimit("user-1", defaultConfig);
    expect(result.resetAt).toBeGreaterThan(now);
    expect(result.resetAt).toBeLessThanOrEqual(now + defaultConfig.windowMs);
  });
});

describe("RATE_LIMITS", () => {
  it("has correct auth config (10 per 15 minutes)", () => {
    expect(RATE_LIMITS.auth.maxRequests).toBe(10);
    expect(RATE_LIMITS.auth.windowMs).toBe(15 * 60 * 1000);
  });

  it("has correct ingest config (10 per minute)", () => {
    expect(RATE_LIMITS.ingest.maxRequests).toBe(10);
    expect(RATE_LIMITS.ingest.windowMs).toBe(60 * 1000);
  });

  it("has correct api config (60 per minute)", () => {
    expect(RATE_LIMITS.api.maxRequests).toBe(60);
    expect(RATE_LIMITS.api.windowMs).toBe(60 * 1000);
  });
});

describe("rateLimit (legacy wrapper)", () => {
  it("returns success: true when within limit", () => {
    const result = rateLimit("legacy-key", { windowMs: 60_000, maxRequests: 5 });
    expect(result.success).toBe(true);
    expect(result.retryAfter).toBeUndefined();
  });

  it("returns success: false with retryAfter when limit exceeded", () => {
    for (let i = 0; i < 5; i++) {
      rateLimit("legacy-key", { windowMs: 60_000, maxRequests: 5 });
    }
    const result = rateLimit("legacy-key", { windowMs: 60_000, maxRequests: 5 });
    expect(result.success).toBe(false);
    expect(result.retryAfter).toBeDefined();
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("uses default options when none provided", () => {
    // Default is 10 requests per 60s (from env or fallback)
    const result = rateLimit("default-key");
    expect(result.success).toBe(true);
  });
});
