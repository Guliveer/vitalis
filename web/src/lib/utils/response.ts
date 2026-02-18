// Standardized API response helpers
// Ensures consistent response format across all API routes

import { NextResponse } from "next/server";

/** Standard success response */
export function successResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status });
}

/** Standard error response */
export function errorResponse(message: string, status = 400): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status });
}

/** Validation error response with field-level details */
export function validationErrorResponse(errors: Record<string, string[]>): NextResponse {
  return NextResponse.json({ success: false, error: "Validation failed", details: errors }, { status: 422 });
}

/** Rate limit exceeded response */
export function rateLimitResponse(retryAfter: number): NextResponse {
  return NextResponse.json(
    { success: false, error: "Too many requests" },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    },
  );
}

/** Service unavailable response (e.g., DB down) */
export function serviceUnavailableResponse(retryAfter = 30): NextResponse {
  return NextResponse.json(
    { success: false, error: "Service temporarily unavailable" },
    {
      status: 503,
      headers: { "Retry-After": String(retryAfter) },
    },
  );
}

/**
 * Sets httpOnly cookies for access and refresh tokens.
 */
export function setAuthCookies(response: NextResponse, accessToken: string, refreshToken: string): NextResponse {
  response.cookies.set("access_token", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60, // 15 minutes
  });

  response.cookies.set("refresh_token", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/refresh",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });

  return response;
}

/**
 * Clears auth cookies by setting maxAge to 0.
 */
export function clearAuthCookies(response: NextResponse): NextResponse {
  response.cookies.set("access_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  response.cookies.set("refresh_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/refresh",
    maxAge: 0,
  });

  return response;
}
