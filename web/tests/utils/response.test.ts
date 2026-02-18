import { successResponse, errorResponse, validationErrorResponse, rateLimitResponse, serviceUnavailableResponse, setAuthCookies, clearAuthCookies } from "@/lib/utils/response";
import { NextResponse } from "next/server";

describe("successResponse", () => {
  it("returns correct body and default 200 status", async () => {
    const res = successResponse({ id: 1, name: "test" });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, data: { id: 1, name: "test" } });
  });

  it("supports custom status code", async () => {
    const res = successResponse({ created: true }, 201);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toEqual({ success: true, data: { created: true } });
  });

  it("handles null data", async () => {
    const res = successResponse(null);
    const body = await res.json();

    expect(body).toEqual({ success: true, data: null });
  });

  it("handles array data", async () => {
    const res = successResponse([1, 2, 3]);
    const body = await res.json();

    expect(body).toEqual({ success: true, data: [1, 2, 3] });
  });
});

describe("errorResponse", () => {
  it("returns correct body and default 400 status", async () => {
    const res = errorResponse("Something went wrong");
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ success: false, error: "Something went wrong" });
  });

  it("supports custom status code", async () => {
    const res = errorResponse("Not found", 404);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ success: false, error: "Not found" });
  });
});

describe("validationErrorResponse", () => {
  it("returns correct body and 422 status", async () => {
    const errors = {
      email: ["Email is required", "Email must be valid"],
      password: ["Password is too short"],
    };
    const res = validationErrorResponse(errors);
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body).toEqual({
      success: false,
      error: "Validation failed",
      details: errors,
    });
  });
});

describe("rateLimitResponse", () => {
  it("returns correct body and 429 status", async () => {
    const res = rateLimitResponse(30);
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body).toEqual({ success: false, error: "Too many requests" });
  });

  it("sets Retry-After header", () => {
    const res = rateLimitResponse(45);
    expect(res.headers.get("Retry-After")).toBe("45");
  });
});

describe("serviceUnavailableResponse", () => {
  it("returns correct body and 503 status", async () => {
    const res = serviceUnavailableResponse();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({
      success: false,
      error: "Service temporarily unavailable",
    });
  });

  it("uses default retryAfter of 30", () => {
    const res = serviceUnavailableResponse();
    expect(res.headers.get("Retry-After")).toBe("30");
  });

  it("supports custom retryAfter", () => {
    const res = serviceUnavailableResponse(60);
    expect(res.headers.get("Retry-After")).toBe("60");
  });
});

describe("setAuthCookies", () => {
  it("sets access_token and refresh_token cookies", () => {
    const response = NextResponse.json({ success: true });
    const result = setAuthCookies(response, "my-access-token", "my-refresh-token");

    const cookies = result.cookies.getAll();
    const accessCookie = cookies.find((c) => c.name === "access_token");
    const refreshCookie = cookies.find((c) => c.name === "refresh_token");

    expect(accessCookie).toBeDefined();
    expect(accessCookie!.value).toBe("my-access-token");

    expect(refreshCookie).toBeDefined();
    expect(refreshCookie!.value).toBe("my-refresh-token");
  });

  it("returns the same response object", () => {
    const response = NextResponse.json({ success: true });
    const result = setAuthCookies(response, "at", "rt");
    expect(result).toBe(response);
  });
});

describe("clearAuthCookies", () => {
  it("clears both auth cookies by setting empty values", () => {
    const response = NextResponse.json({ success: true });
    setAuthCookies(response, "at", "rt");
    clearAuthCookies(response);

    const cookies = response.cookies.getAll();
    const accessCookie = cookies.find((c) => c.name === "access_token");
    const refreshCookie = cookies.find((c) => c.name === "refresh_token");

    expect(accessCookie).toBeDefined();
    expect(accessCookie!.value).toBe("");

    expect(refreshCookie).toBeDefined();
    expect(refreshCookie!.value).toBe("");
  });

  it("returns the same response object", () => {
    const response = NextResponse.json({ success: true });
    const result = clearAuthCookies(response);
    expect(result).toBe(response);
  });
});
