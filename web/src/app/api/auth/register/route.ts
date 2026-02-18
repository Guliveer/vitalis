// POST /api/auth/register — creates a new user account with email/password

import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { registerSchema } from "@/lib/validation/auth";
import { hashPassword } from "@/lib/auth/password";
import { createAccessToken, createRefreshToken } from "@/lib/auth/jwt";
import { successResponse, errorResponse, validationErrorResponse, setAuthCookies } from "@/lib/utils/response";
import { checkRateLimit, RATE_LIMITS } from "@/lib/utils/rate-limit";

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    const rateLimitResult = checkRateLimit(`auth:register:${ip}`, RATE_LIMITS.auth);
    if (!rateLimitResult.allowed) {
      return errorResponse("Too many requests. Please try again later.", 429);
    }

    // Parse and validate request body
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path.join(".");
        if (!fieldErrors[field]) fieldErrors[field] = [];
        fieldErrors[field].push(issue.message);
      }
      return validationErrorResponse(fieldErrors);
    }

    const { email, password } = parsed.data;
    const db = getDb();

    // Check if email already exists
    const existingUsers = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);

    if (existingUsers.length > 0) {
      return errorResponse("An account with this email already exists", 409);
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Determine role: first user gets ADMIN
    const userCount = await db.select({ id: users.id }).from(users).limit(1);
    const role = userCount.length === 0 ? "ADMIN" : "USER";

    // Insert new user
    const [newUser] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        role,
      })
      .returning({
        id: users.id,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });

    // Create tokens
    const accessToken = await createAccessToken({
      sub: newUser.id,
      email: newUser.email,
      role: newUser.role,
    });
    const refreshToken = await createRefreshToken(newUser.id);

    // Build response with cookies
    const response = successResponse(
      {
        user: {
          id: newUser.id,
          email: newUser.email,
          role: newUser.role,
          createdAt: newUser.createdAt,
          updatedAt: newUser.updatedAt,
        },
      },
      201,
    );

    return setAuthCookies(response, accessToken, refreshToken);
  } catch (error) {
    console.error("Registration error:", error);
    return errorResponse("Internal server error", 500);
  }
}
