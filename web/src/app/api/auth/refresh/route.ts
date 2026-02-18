// POST /api/auth/refresh — refreshes the access token using the refresh token cookie

import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyRefreshToken, createAccessToken, createRefreshToken } from "@/lib/auth/jwt";
import { successResponse, errorResponse, setAuthCookies } from "@/lib/utils/response";

export async function POST(request: NextRequest) {
  try {
    // Extract refresh token from cookie
    const token = request.cookies.get("refresh_token")?.value;

    if (!token) {
      return errorResponse("Refresh token required", 401);
    }

    // Verify refresh token
    let payload: { sub: string };
    try {
      payload = await verifyRefreshToken(token);
    } catch {
      return errorResponse("Invalid or expired refresh token", 401);
    }

    const db = getDb();

    // Look up user to ensure they still exist and are active
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!user) {
      return errorResponse("User not found", 401);
    }

    // Create new token pair (token rotation)
    const newAccessToken = await createAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    const newRefreshToken = await createRefreshToken(user.id);

    // Build response with new cookies
    const response = successResponse({ message: "Token refreshed" });
    return setAuthCookies(response, newAccessToken, newRefreshToken);
  } catch (error) {
    console.error("Token refresh error:", error);
    return errorResponse("Internal server error", 500);
  }
}
