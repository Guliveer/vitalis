import { diskUsageEntrySchema, processEntrySchema, singleMetricSchema, metricBatchSchema } from "../../src/lib/validation/metrics";

const validMetric = {
  timestamp: "2026-01-15T10:30:00.000000000Z",
  cpu_overall: 45.5,
  cpu_cores: [30.0, 60.0, 45.0, 50.0],
  ram_used: 8589934592,
  ram_total: 17179869184,
  disk_usage: [{ mount: "/", total: 500000000000, used: 250000000000, free: 250000000000 }],
  network_rx: 1048576,
  network_tx: 524288,
  uptime_seconds: 86400,
  cpu_temp: 65.0,
  gpu_temp: null,
  processes: [{ pid: 1, name: "systemd", cpu: 0.1, memory: 10.5, status: "running" }],
};

// ---------------------------------------------------------------------------
// diskUsageEntrySchema
// ---------------------------------------------------------------------------
describe("diskUsageEntrySchema", () => {
  it("accepts a valid entry", () => {
    const result = diskUsageEntrySchema.safeParse({
      mount: "/",
      total: 500000000000,
      used: 250000000000,
      free: 250000000000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a negative total", () => {
    const result = diskUsageEntrySchema.safeParse({
      mount: "/",
      total: -1,
      used: 0,
      free: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer values", () => {
    const result = diskUsageEntrySchema.safeParse({
      mount: "/",
      total: 100.5,
      used: 50,
      free: 50,
    });
    expect(result.success).toBe(false);
  });

  it("rejects mount longer than 255 characters", () => {
    const result = diskUsageEntrySchema.safeParse({
      mount: "a".repeat(256),
      total: 100,
      used: 50,
      free: 50,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// processEntrySchema
// ---------------------------------------------------------------------------
describe("processEntrySchema", () => {
  it("accepts a valid entry", () => {
    const result = processEntrySchema.safeParse({
      pid: 1,
      name: "systemd",
      cpu: 0.1,
      memory: 10.5,
      status: "running",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a negative pid", () => {
    const result = processEntrySchema.safeParse({
      pid: -1,
      name: "systemd",
      cpu: 0.1,
      memory: 10.5,
      status: "running",
    });
    expect(result.success).toBe(false);
  });

  it("rejects cpu greater than 100", () => {
    const result = processEntrySchema.safeParse({
      pid: 1,
      name: "systemd",
      cpu: 100.1,
      memory: 10.5,
      status: "running",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative memory", () => {
    const result = processEntrySchema.safeParse({
      pid: 1,
      name: "systemd",
      cpu: 0.1,
      memory: -1,
      status: "running",
    });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 255 characters", () => {
    const result = processEntrySchema.safeParse({
      pid: 1,
      name: "a".repeat(256),
      cpu: 0.1,
      memory: 10.5,
      status: "running",
    });
    expect(result.success).toBe(false);
  });

  it("rejects status longer than 50 characters", () => {
    const result = processEntrySchema.safeParse({
      pid: 1,
      name: "systemd",
      cpu: 0.1,
      memory: 10.5,
      status: "a".repeat(51),
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// singleMetricSchema
// ---------------------------------------------------------------------------
describe("singleMetricSchema", () => {
  it("accepts valid input with all fields", () => {
    const result = singleMetricSchema.safeParse(validMetric);
    expect(result.success).toBe(true);
  });

  it("accepts nanosecond-precision timestamp (Go format)", () => {
    const result = singleMetricSchema.safeParse({
      ...validMetric,
      timestamp: "2026-01-15T10:30:00.123456789Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts millisecond-precision timestamp (3 fractional digits)", () => {
    const result = singleMetricSchema.safeParse({
      ...validMetric,
      timestamp: "2026-01-15T10:30:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts microsecond-precision timestamp (6 fractional digits)", () => {
    const result = singleMetricSchema.safeParse({
      ...validMetric,
      timestamp: "2026-01-15T10:30:00.123456Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts timestamp with no fractional seconds", () => {
    const result = singleMetricSchema.safeParse({
      ...validMetric,
      timestamp: "2026-01-15T10:30:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects timestamp with more than 9 fractional digits", () => {
    const result = singleMetricSchema.safeParse({
      ...validMetric,
      timestamp: "2026-01-15T10:30:00.1234567890Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-UTC timestamp (with offset)", () => {
    const result = singleMetricSchema.safeParse({
      ...validMetric,
      timestamp: "2026-01-15T10:30:00+02:00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid timestamp string", () => {
    const result = singleMetricSchema.safeParse({
      ...validMetric,
      timestamp: "not-a-timestamp",
    });
    expect(result.success).toBe(false);
  });

  it("transforms null cpu_cores to empty array", () => {
    const result = singleMetricSchema.safeParse({
      ...validMetric,
      cpu_cores: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cpu_cores).toEqual([]);
    }
  });

  it("transforms null disk_usage to empty array", () => {
    const result = singleMetricSchema.safeParse({
      ...validMetric,
      disk_usage: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.disk_usage).toEqual([]);
    }
  });

  it("transforms null processes to empty array", () => {
    const result = singleMetricSchema.safeParse({
      ...validMetric,
      processes: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.processes).toEqual([]);
    }
  });

  it("rejects cpu_overall greater than 100", () => {
    const result = singleMetricSchema.safeParse({
      ...validMetric,
      cpu_overall: 100.1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects cpu_overall less than 0", () => {
    const result = singleMetricSchema.safeParse({
      ...validMetric,
      cpu_overall: -0.1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative ram_used", () => {
    const result = singleMetricSchema.safeParse({
      ...validMetric,
      ram_used: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero ram_total (must be positive)", () => {
    const result = singleMetricSchema.safeParse({
      ...validMetric,
      ram_total: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer ram values", () => {
    const result = singleMetricSchema.safeParse({
      ...validMetric,
      ram_used: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative network_rx", () => {
    const result = singleMetricSchema.safeParse({
      ...validMetric,
      network_rx: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative uptime_seconds", () => {
    const result = singleMetricSchema.safeParse({
      ...validMetric,
      uptime_seconds: -1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts null cpu_temp", () => {
    const result = singleMetricSchema.safeParse({
      ...validMetric,
      cpu_temp: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cpu_temp).toBeNull();
    }
  });

  it("accepts missing cpu_temp (optional)", () => {
    const { cpu_temp, ...withoutCpuTemp } = validMetric;
    const result = singleMetricSchema.safeParse(withoutCpuTemp);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cpu_temp).toBeUndefined();
    }
  });

  it("rejects more than 256 cpu cores", () => {
    const result = singleMetricSchema.safeParse({
      ...validMetric,
      cpu_cores: Array.from({ length: 257 }, () => 50.0),
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 50 disk entries", () => {
    const result = singleMetricSchema.safeParse({
      ...validMetric,
      disk_usage: Array.from({ length: 51 }, () => ({
        mount: "/",
        total: 100,
        used: 50,
        free: 50,
      })),
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 50 processes", () => {
    const result = singleMetricSchema.safeParse({
      ...validMetric,
      processes: Array.from({ length: 51 }, (_, i) => ({
        pid: i,
        name: "proc",
        cpu: 1.0,
        memory: 10.0,
        status: "running",
      })),
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// metricBatchSchema
// ---------------------------------------------------------------------------
describe("metricBatchSchema", () => {
  it("accepts valid input with a machine token", () => {
    const result = metricBatchSchema.safeParse({
      machine_token: "tok_abc123",
      metrics: [validMetric],
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid input without a machine token", () => {
    const result = metricBatchSchema.safeParse({
      metrics: [validMetric],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty metrics array", () => {
    const result = metricBatchSchema.safeParse({
      metrics: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 120 metrics", () => {
    const result = metricBatchSchema.safeParse({
      metrics: Array.from({ length: 121 }, () => validMetric),
    });
    expect(result.success).toBe(false);
  });

  it("accepts exactly 120 metrics", () => {
    const result = metricBatchSchema.safeParse({
      metrics: Array.from({ length: 120 }, () => validMetric),
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty machine token string", () => {
    const result = metricBatchSchema.safeParse({
      machine_token: "",
      metrics: [validMetric],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a machine token longer than 255 characters", () => {
    const result = metricBatchSchema.safeParse({
      machine_token: "a".repeat(256),
      metrics: [validMetric],
    });
    expect(result.success).toBe(false);
  });
});
