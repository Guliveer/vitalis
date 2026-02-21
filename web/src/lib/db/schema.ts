// Drizzle ORM schema definitions
// Mirrors the SQL schema from docs/ARCHITECTURE.md Section 3
// with refinements from the implementation spec

import { pgTable, uuid, varchar, timestamp, real, bigint, integer, jsonb, date, uniqueIndex, index } from "drizzle-orm/pg-core";

// ============================================================
// USERS
// ============================================================
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 20 }).notNull().default("USER"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ============================================================
// MACHINES
// ============================================================
export const machines = pgTable("machines", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  machineToken: varchar("machine_token", { length: 255 }).notNull().unique(),
  os: varchar("os", { length: 50 }),
  arch: varchar("arch", { length: 50 }),
  osVersion: varchar("os_version", { length: 100 }),
  osName: varchar("os_name", { length: 100 }),
  lastSeen: timestamp("last_seen", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ============================================================
// MACHINE ACCESS (multi-user sharing)
// ============================================================
export const machineAccess = pgTable(
  "machine_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    machineId: uuid("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permission: varchar("permission", { length: 20 }).notNull().default("READ"),
    grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [uniqueIndex("uq_machine_access_machine_user").on(table.machineId, table.userId)],
);

// ============================================================
// METRICS
// ============================================================
export const metrics = pgTable(
  "metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    machineId: uuid("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "cascade" }),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    cpuOverall: real("cpu_overall"),
    cpuCores: jsonb("cpu_cores"),
    ramUsed: bigint("ram_used", { mode: "number" }),
    ramTotal: bigint("ram_total", { mode: "number" }),
    diskUsage: jsonb("disk_usage"),
    networkRx: bigint("network_rx", { mode: "number" }),
    networkTx: bigint("network_tx", { mode: "number" }),
    uptimeSeconds: integer("uptime_seconds"),
    cpuTemp: real("cpu_temp"),
    gpuTemp: real("gpu_temp"),
  },
  (table) => [index("idx_metrics_machine_time").on(table.machineId, table.timestamp)],
);

// ============================================================
// PROCESS SNAPSHOTS
// ============================================================
export const processSnapshots = pgTable("process_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  metricId: uuid("metric_id")
    .notNull()
    .references(() => metrics.id, { onDelete: "cascade" }),
  processes: jsonb("processes").notNull(),
});

// ============================================================
// HOURLY AGGREGATES (30-day retention)
// ============================================================
export const metricsHourly = pgTable(
  "metrics_hourly",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    machineId: uuid("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "cascade" }),
    hour: timestamp("hour", { withTimezone: true }).notNull(),
    cpuAvg: real("cpu_avg"),
    cpuMax: real("cpu_max"),
    ramAvg: bigint("ram_avg", { mode: "number" }),
    ramMax: bigint("ram_max", { mode: "number" }),
    networkRxTotal: bigint("network_rx_total", { mode: "number" }),
    networkTxTotal: bigint("network_tx_total", { mode: "number" }),
    sampleCount: integer("sample_count"),
  },
  (table) => [uniqueIndex("uq_metrics_hourly_machine_hour").on(table.machineId, table.hour), index("idx_metrics_hourly_machine_hour").on(table.machineId, table.hour)],
);

// ============================================================
// DAILY AGGREGATES (1-year retention)
// ============================================================
export const metricsDaily = pgTable(
  "metrics_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    machineId: uuid("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    cpuAvg: real("cpu_avg"),
    cpuMax: real("cpu_max"),
    ramAvg: bigint("ram_avg", { mode: "number" }),
    ramMax: bigint("ram_max", { mode: "number" }),
    networkRxTotal: bigint("network_rx_total", { mode: "number" }),
    networkTxTotal: bigint("network_tx_total", { mode: "number" }),
    sampleCount: integer("sample_count"),
  },
  (table) => [uniqueIndex("uq_metrics_daily_machine_day").on(table.machineId, table.day), index("idx_metrics_daily_machine_day").on(table.machineId, table.day)],
);

// ============================================================
// INFERRED TYPES
// ============================================================

// Users
export type SelectUser = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Machines
export type SelectMachine = typeof machines.$inferSelect;
export type InsertMachine = typeof machines.$inferInsert;

// Machine Access
export type SelectMachineAccess = typeof machineAccess.$inferSelect;
export type InsertMachineAccess = typeof machineAccess.$inferInsert;

// Metrics
export type SelectMetric = typeof metrics.$inferSelect;
export type InsertMetric = typeof metrics.$inferInsert;

// Process Snapshots
export type SelectProcessSnapshot = typeof processSnapshots.$inferSelect;
export type InsertProcessSnapshot = typeof processSnapshots.$inferInsert;

// Metrics Hourly
export type SelectMetricHourly = typeof metricsHourly.$inferSelect;
export type InsertMetricHourly = typeof metricsHourly.$inferInsert;

// Metrics Daily
export type SelectMetricDaily = typeof metricsDaily.$inferSelect;
export type InsertMetricDaily = typeof metricsDaily.$inferInsert;
