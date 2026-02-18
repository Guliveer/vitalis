import { createMachineSchema, updateMachineSchema, shareMachineSchema, metricQuerySchema } from "../../src/lib/validation/machines";

describe("createMachineSchema", () => {
  it("accepts valid input with all fields", () => {
    const result = createMachineSchema.safeParse({
      name: "my-server",
      os: "Ubuntu 22.04",
      arch: "x86_64",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid input with only name", () => {
    const result = createMachineSchema.safeParse({ name: "my-server" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = createMachineSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a name longer than 255 characters", () => {
    const result = createMachineSchema.safeParse({ name: "a".repeat(256) });
    expect(result.success).toBe(false);
  });

  it("trims whitespace from name", () => {
    const result = createMachineSchema.safeParse({ name: "  my-server  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("my-server");
    }
  });

  it("rejects os longer than 50 characters", () => {
    const result = createMachineSchema.safeParse({
      name: "my-server",
      os: "a".repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it("rejects arch longer than 50 characters", () => {
    const result = createMachineSchema.safeParse({
      name: "my-server",
      arch: "a".repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it("rejects when name is missing", () => {
    const result = createMachineSchema.safeParse({ os: "Linux" });
    expect(result.success).toBe(false);
  });
});

describe("updateMachineSchema", () => {
  it("accepts a valid name", () => {
    const result = updateMachineSchema.safeParse({ name: "new-name" });
    expect(result.success).toBe(true);
  });

  it("accepts an empty object (name is optional)", () => {
    const result = updateMachineSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects an empty name string", () => {
    const result = updateMachineSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});

describe("shareMachineSchema", () => {
  it("accepts valid input with READ permission", () => {
    const result = shareMachineSchema.safeParse({
      email: "user@example.com",
      permission: "READ",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid input with WRITE permission", () => {
    const result = shareMachineSchema.safeParse({
      email: "user@example.com",
      permission: "WRITE",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid permission value", () => {
    const result = shareMachineSchema.safeParse({
      email: "user@example.com",
      permission: "ADMIN",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = shareMachineSchema.safeParse({
      email: "not-an-email",
      permission: "READ",
    });
    expect(result.success).toBe(false);
  });
});

describe("metricQuerySchema", () => {
  it("accepts valid input with all fields", () => {
    const result = metricQuerySchema.safeParse({
      from: "2026-01-01T00:00:00Z",
      to: "2026-01-02T00:00:00Z",
      resolution: "raw",
    });
    expect(result.success).toBe(true);
  });

  it('defaults resolution to "raw" when not provided', () => {
    const result = metricQuerySchema.safeParse({
      from: "2026-01-01T00:00:00Z",
      to: "2026-01-02T00:00:00Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resolution).toBe("raw");
    }
  });

  it("accepts hourly resolution", () => {
    const result = metricQuerySchema.safeParse({
      from: "2026-01-01T00:00:00Z",
      to: "2026-01-02T00:00:00Z",
      resolution: "hourly",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resolution).toBe("hourly");
    }
  });

  it("accepts daily resolution", () => {
    const result = metricQuerySchema.safeParse({
      from: "2026-01-01T00:00:00Z",
      to: "2026-01-02T00:00:00Z",
      resolution: "daily",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resolution).toBe("daily");
    }
  });

  it("rejects an invalid resolution value", () => {
    const result = metricQuerySchema.safeParse({
      from: "2026-01-01T00:00:00Z",
      to: "2026-01-02T00:00:00Z",
      resolution: "weekly",
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-datetime "from" value', () => {
    const result = metricQuerySchema.safeParse({
      from: "not-a-date",
      to: "2026-01-02T00:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-datetime "to" value', () => {
    const result = metricQuerySchema.safeParse({
      from: "2026-01-01T00:00:00Z",
      to: "not-a-date",
    });
    expect(result.success).toBe(false);
  });
});
