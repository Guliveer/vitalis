import { loginSchema, registerSchema } from "../../src/lib/validation/auth";

describe("loginSchema", () => {
  it("accepts valid input", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty email", () => {
    const result = loginSchema.safeParse({
      email: "",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password longer than 128 characters", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "a".repeat(129),
    });
    expect(result.success).toBe(false);
  });

  it("accepts a password with exactly 8 characters", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "a".repeat(8),
    });
    expect(result.success).toBe(true);
  });

  it("accepts a password with exactly 128 characters", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "a".repeat(128),
    });
    expect(result.success).toBe(true);
  });

  it("rejects an email longer than 255 characters", () => {
    const longLocal = "a".repeat(250);
    const result = loginSchema.safeParse({
      email: `${longLocal}@example.com`,
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when email is missing", () => {
    const result = loginSchema.safeParse({
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when password is missing", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when both fields are missing", () => {
    const result = loginSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("registerSchema", () => {
  it("accepts valid input with all character requirements", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "Passw0rd",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a password missing an uppercase letter", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "password1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("Must contain at least one uppercase letter");
    }
  });

  it("rejects a password missing a lowercase letter", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "PASSWORD1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("Must contain at least one lowercase letter");
    }
  });

  it("rejects a password missing a number", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "Password",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("Must contain at least one number");
    }
  });

  it("accepts a password meeting all requirements", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "Str0ngP@ss",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a password that is too short even with all character types", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "Ab1",
    });
    expect(result.success).toBe(false);
  });
});
