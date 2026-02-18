// In-memory rate limiter for API routes
// Uses a fixed window approach per key (machine token or user ID)
// Resets on cold start (acceptable for serverless)

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

/**
 * Check rate limit for a given key.
 * Uses in-memory store — resets on cold start (acceptable for serverless).
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  cleanup();

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    // New window
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs };
  }

  if (entry.count >= config.maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, resetAt: entry.resetAt, retryAfter };
  }

  entry.count++;
  return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt };
}

/**
 * Legacy helper — wraps checkRateLimit for backward compatibility.
 */
export function rateLimit(
  key: string,
  options?: {
    windowMs?: number;
    maxRequests?: number;
  },
): { success: boolean; retryAfter?: number } {
  const config: RateLimitConfig = {
    windowMs: options?.windowMs ?? Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
    maxRequests: options?.maxRequests ?? Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 10),
  };

  const result = checkRateLimit(key, config);
  return result.allowed ? { success: true } : { success: false, retryAfter: result.retryAfter };
}

/**
 * Default rate limit configs for different endpoints.
 */
export const RATE_LIMITS = {
  auth: { windowMs: 15 * 60 * 1000, maxRequests: 10 } as RateLimitConfig, // 10 per 15 min
  ingest: { windowMs: 60 * 1000, maxRequests: 10 } as RateLimitConfig, // 10 per minute per machine
  api: { windowMs: 60 * 1000, maxRequests: 60 } as RateLimitConfig, // 60 per minute
} as const;
