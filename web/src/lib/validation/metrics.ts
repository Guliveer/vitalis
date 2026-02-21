// Zod schemas for metric ingestion payloads

import { z } from "zod";

export const diskUsageEntrySchema = z.object({
  mount: z.string().max(255),
  fs: z.string().max(50).optional(),
  total: z.number().int().nonnegative(),
  used: z.number().int().nonnegative(),
  free: z.number().int().nonnegative(),
});

export const processEntrySchema = z.object({
  pid: z.number().int().nonnegative(),
  name: z.string().max(255),
  cpu: z.number().min(0).max(100),
  memory: z.number().nonnegative(),
  status: z.string().max(50),
});

export const singleMetricSchema = z.object({
  timestamp: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/, "Invalid ISO 8601 timestamp (expected UTC with optional fractional seconds)"),
  cpu_overall: z.number().min(0).max(100),
  cpu_cores: z
    .array(z.number().min(0).max(100))
    .max(256)
    .nullable()
    .transform((v) => v ?? []),
  ram_used: z.number().int().nonnegative(),
  ram_total: z.number().int().positive(),
  disk_usage: z
    .array(diskUsageEntrySchema)
    .max(50)
    .nullable()
    .transform((v) => v ?? []),
  network_rx: z.number().int().nonnegative(),
  network_tx: z.number().int().nonnegative(),
  uptime_seconds: z.number().int().nonnegative(),
  cpu_temp: z.number().nullable().optional(),
  gpu_temp: z.number().nullable().optional(),
  processes: z
    .array(processEntrySchema)
    .max(50)
    .nullable()
    .transform((v) => v ?? []),
  os_version: z.string().max(100).optional(),
  os_name: z.string().max(100).optional(),
});

export const metricBatchSchema = z.object({
  machine_token: z.string().min(1).max(255).optional(), // Optional in body — prefer Authorization header (MEDIUM-3)
  metrics: z.array(singleMetricSchema).min(1).max(120), // max ~2 minutes of 15s intervals
});

export type MetricBatchInput = z.infer<typeof metricBatchSchema>;
