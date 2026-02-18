import { createAccessToken, createRefreshToken, verifyAccessToken, verifyRefreshToken } from "@/lib/auth/jwt";

describe("createAccessToken", () => {
  it("returns a JWT string", async () => {
    const token = await createAccessToken({
      sub: "user-123",
      email: "test@example.com",
      role: "USER",
    });
    expect(typeof token).toBe("string");
    // JWTs have 3 dot-separated parts
    expect(token.split(".")).toHaveLength(3);
  });
});

describe("verifyAccessToken", () => {
  it("correctly decodes a created token", async () => {
    const token = await createAccessToken({
      sub: "user-123",
      email: "test@example.com",
      role: "USER",
    });
    const payload = await verifyAccessToken(token);
    expect(payload).toBeDefined();
  });

  it("returns correct payload fields (sub, email, role)", async () => {
    const token = await createAccessToken({
      sub: "user-456",
      email: "admin@example.com",
      role: "ADMIN",
    });
    const payload = await verifyAccessToken(token);
    expect(payload.sub).toBe("user-456");
    expect(payload.email).toBe("admin@example.com");
    expect(payload.role).toBe("ADMIN");
  });

  it("includes iat and exp claims", async () => {
    const token = await createAccessToken({
      sub: "user-123",
      email: "test@example.com",
      role: "USER",
    });
    const payload = await verifyAccessToken(token);
    expect(payload.iat).toBeDefined();
    expect(payload.exp).toBeDefined();
    expect(typeof payload.iat).toBe("number");
    expect(typeof payload.exp).toBe("number");
  });

  it("rejects an invalid token", async () => {
    await expect(verifyAccessToken("invalid.token.here")).rejects.toThrow();
  });

  it("rejects a tampered token", async () => {
    const token = await createAccessToken({
      sub: "user-123",
      email: "test@example.com",
      role: "USER",
    });
    // Tamper with the payload section
    const parts = token.split(".");
    parts[1] = parts[1] + "tampered";
    const tampered = parts.join(".");
    await expect(verifyAccessToken(tampered)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    jest.useFakeTimers();

    const token = await createAccessToken({
      sub: "user-123",
      email: "test@example.com",
      role: "USER",
    });

    // Advance time past the 15-minute expiry
    jest.advanceTimersByTime(16 * 60 * 1000);

    await expect(verifyAccessToken(token)).rejects.toThrow();

    jest.useRealTimers();
  });
});

describe("createRefreshToken", () => {
  it("returns a JWT string", async () => {
    const token = await createRefreshToken("user-123");
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);
  });
});

describe("verifyRefreshToken", () => {
  it("correctly decodes a created refresh token", async () => {
    const token = await createRefreshToken("user-789");
    const payload = await verifyRefreshToken(token);
    expect(payload).toBeDefined();
  });

  it("returns correct payload (sub, type: 'refresh')", async () => {
    const token = await createRefreshToken("user-789");
    const payload = await verifyRefreshToken(token);
    expect(payload.sub).toBe("user-789");
    expect(payload.type).toBe("refresh");
  });

  it("rejects an invalid token", async () => {
    await expect(verifyRefreshToken("not.a.valid.token")).rejects.toThrow();
  });
});

describe("cross-verification (different secrets)", () => {
  it("access token cannot be verified as refresh token", async () => {
    const accessToken = await createAccessToken({
      sub: "user-123",
      email: "test@example.com",
      role: "USER",
    });
    await expect(verifyRefreshToken(accessToken)).rejects.toThrow();
  });

  it("refresh token cannot be verified as access token", async () => {
    const refreshToken = await createRefreshToken("user-123");
    await expect(verifyAccessToken(refreshToken)).rejects.toThrow();
  });
});
