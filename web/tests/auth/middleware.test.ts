import { NextRequest, NextResponse } from "next/server";
import { withAuth, withAdmin } from "@/lib/auth/middleware";
import { createAccessToken } from "@/lib/auth/jwt";

/**
 * Helper to create a NextRequest with optional access_token cookie.
 */
function createMockRequest(accessToken?: string): NextRequest {
  const url = "http://localhost:3000/api/test";
  const request = new NextRequest(url);

  if (accessToken) {
    request.cookies.set("access_token", accessToken);
  }

  return request;
}

describe("withAuth", () => {
  it("returns 401 when no access_token cookie is present", async () => {
    const handler = jest.fn();
    const wrappedHandler = withAuth(handler);

    const request = createMockRequest();
    const response = await wrappedHandler(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Authentication required");
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 401 for an invalid token", async () => {
    const handler = jest.fn();
    const wrappedHandler = withAuth(handler);

    const request = createMockRequest("invalid-token");
    const response = await wrappedHandler(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Invalid or expired token");
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls handler with correct context for a valid token", async () => {
    const handler = jest.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const wrappedHandler = withAuth(handler);

    const token = await createAccessToken({
      sub: "user-123",
      email: "test@example.com",
      role: "USER",
    });

    const request = createMockRequest(token);
    const response = await wrappedHandler(request);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);

    const [calledRequest, calledContext] = handler.mock.calls[0];
    expect(calledRequest).toBe(request);
    expect(calledContext.user.sub).toBe("user-123");
    expect(calledContext.user.email).toBe("test@example.com");
    expect(calledContext.user.role).toBe("USER");
  });
});

describe("withAdmin", () => {
  it("returns 403 for non-admin role", async () => {
    const handler = jest.fn();
    const wrappedHandler = withAdmin(handler);

    const token = await createAccessToken({
      sub: "user-123",
      email: "user@example.com",
      role: "USER",
    });

    const request = createMockRequest(token);
    const response = await wrappedHandler(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Admin access required");
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls handler for admin role", async () => {
    const handler = jest.fn().mockResolvedValue(NextResponse.json({ admin: true }));
    const wrappedHandler = withAdmin(handler);

    const token = await createAccessToken({
      sub: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
    });

    const request = createMockRequest(token);
    const response = await wrappedHandler(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ admin: true });
    expect(handler).toHaveBeenCalledTimes(1);

    const [, calledContext] = handler.mock.calls[0];
    expect(calledContext.user.role).toBe("ADMIN");
  });

  it("returns 401 when no cookie is present (inherits withAuth behavior)", async () => {
    const handler = jest.fn();
    const wrappedHandler = withAdmin(handler);

    const request = createMockRequest();
    const response = await wrappedHandler(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Authentication required");
    expect(handler).not.toHaveBeenCalled();
  });
});
