// Auth middleware for API route handlers
// Extracts and verifies JWT from cookies, attaches user info to request context

import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, type AccessTokenPayload } from "./jwt";

/** Authenticated request context passed to route handlers */
export interface AuthContext {
  user: AccessTokenPayload;
}

/**
 * Wraps an API route handler with authentication.
 * Extracts the access token from cookies, verifies it,
 * and passes the decoded payload to the handler.
 */
export function withAuth(handler: (request: NextRequest, context: AuthContext) => Promise<NextResponse>) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const token = request.cookies.get("access_token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    try {
      const payload = await verifyAccessToken(token);
      return handler(request, { user: payload });
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
  };
}

/**
 * Wraps an API route handler with admin-only authentication.
 */
export function withAdmin(handler: (request: NextRequest, context: AuthContext) => Promise<NextResponse>) {
  return withAuth(async (request, context) => {
    if (context.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    return handler(request, context);
  });
}
