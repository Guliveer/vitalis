import { formatBytes, formatUptime, formatRelativeTime, formatPercentage, formatTemperature } from "@/lib/utils/format";

describe("formatBytes", () => {
  it("returns '0 B' for 0 bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats bytes below 1 KB", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1)).toBe("1 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1048576)).toBe("1 MB");
    expect(formatBytes(1572864)).toBe("1.5 MB");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(1073741824)).toBe("1 GB");
    expect(formatBytes(2684354560)).toBe("2.5 GB");
  });

  it("formats terabytes", () => {
    expect(formatBytes(1099511627776)).toBe("1 TB");
  });

  it("handles decimal precision correctly (strips trailing zeros)", () => {
    // 1024 bytes = 1.0 KB → parseFloat removes trailing zero → "1 KB"
    expect(formatBytes(1024)).toBe("1 KB");
    // 1536 bytes = 1.5 KB → keeps the .5
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("handles negative values", () => {
    // Math.log of negative is NaN, so this will produce NaN-based results
    // The function doesn't guard against negatives — verify it doesn't throw
    expect(() => formatBytes(-1)).not.toThrow();
  });
});

describe("formatUptime", () => {
  it("formats seconds as minutes when less than an hour", () => {
    expect(formatUptime(45)).toBe("0m");
    expect(formatUptime(120)).toBe("2m");
  });

  it("formats minutes and seconds (only shows minutes)", () => {
    expect(formatUptime(125)).toBe("2m");
  });

  it("formats hours and minutes", () => {
    expect(formatUptime(3720)).toBe("1h 2m");
  });

  it("formats days, hours, and minutes", () => {
    expect(formatUptime(90120)).toBe("1d 1h 2m");
  });

  it("returns '0m' for 0 seconds", () => {
    expect(formatUptime(0)).toBe("0m");
  });

  it("formats exactly one day", () => {
    expect(formatUptime(86400)).toBe("1d 0h 0m");
  });

  it("formats exactly one hour", () => {
    expect(formatUptime(3600)).toBe("1h 0m");
  });
});

describe("formatRelativeTime", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-15T12:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns 'just now' for less than 60 seconds ago", () => {
    const date = new Date("2026-01-15T11:59:30Z"); // 30 seconds ago
    expect(formatRelativeTime(date)).toBe("just now");
  });

  it("returns minutes ago for less than 60 minutes", () => {
    const date = new Date("2026-01-15T11:55:00Z"); // 5 minutes ago
    expect(formatRelativeTime(date)).toBe("5m ago");
  });

  it("returns hours ago for less than 24 hours", () => {
    const date = new Date("2026-01-15T10:00:00Z"); // 2 hours ago
    expect(formatRelativeTime(date)).toBe("2h ago");
  });

  it("returns days ago for 24+ hours", () => {
    const date = new Date("2026-01-12T12:00:00Z"); // 3 days ago
    expect(formatRelativeTime(date)).toBe("3d ago");
  });

  it("accepts string dates", () => {
    expect(formatRelativeTime("2026-01-15T11:55:00Z")).toBe("5m ago");
  });

  it("accepts Date objects", () => {
    const date = new Date("2026-01-15T11:55:00Z");
    expect(formatRelativeTime(date)).toBe("5m ago");
  });

  it("returns 'just now' for exactly 0 seconds difference", () => {
    const date = new Date("2026-01-15T12:00:00Z");
    expect(formatRelativeTime(date)).toBe("just now");
  });

  it("returns '1m ago' at exactly 60 seconds", () => {
    const date = new Date("2026-01-15T11:59:00Z"); // exactly 60 seconds ago
    expect(formatRelativeTime(date)).toBe("1m ago");
  });

  it("returns '1h ago' at exactly 60 minutes", () => {
    const date = new Date("2026-01-15T11:00:00Z"); // exactly 60 minutes ago
    expect(formatRelativeTime(date)).toBe("1h ago");
  });

  it("returns '1d ago' at exactly 24 hours", () => {
    const date = new Date("2026-01-14T12:00:00Z"); // exactly 24 hours ago
    expect(formatRelativeTime(date)).toBe("1d ago");
  });
});

describe("formatPercentage", () => {
  it("formats a normal percentage value", () => {
    expect(formatPercentage(45.23)).toBe("45.2%");
  });

  it("formats 0", () => {
    expect(formatPercentage(0)).toBe("0.0%");
  });

  it("formats 100", () => {
    expect(formatPercentage(100)).toBe("100.0%");
  });

  it("rounds to one decimal place", () => {
    expect(formatPercentage(33.3333)).toBe("33.3%");
    expect(formatPercentage(66.6666)).toBe("66.7%");
  });
});

describe("formatTemperature", () => {
  it("formats a normal temperature value", () => {
    expect(formatTemperature(65)).toBe("65°C");
  });

  it("returns 'N/A' for null", () => {
    expect(formatTemperature(null)).toBe("N/A");
  });

  it("rounds to integer", () => {
    expect(formatTemperature(65.7)).toBe("66°C");
    expect(formatTemperature(65.3)).toBe("65°C");
  });

  it("formats 0 degrees", () => {
    expect(formatTemperature(0)).toBe("0°C");
  });
});
