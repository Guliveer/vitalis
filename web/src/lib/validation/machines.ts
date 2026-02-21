// Zod schemas for machine operations (create, update, share, query)

import { z } from "zod";

export const createMachineSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  os: z.string().max(50).optional(),
  arch: z.string().max(50).optional(),
});

export const updateMachineSchema = z.object({
  name: z.string().min(1).max(255).trim().optional(),
});

export const shareMachineSchema = z.object({
  email: z.string().email().max(255),
  permission: z.enum(["READ", "WRITE"]),
});

export const metricQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  resolution: z.enum(["raw", "hourly", "daily"]).default("raw"),
});

export type CreateMachineInput = z.infer<typeof createMachineSchema>;
export type UpdateMachineInput = z.infer<typeof updateMachineSchema>;
export type ShareMachineInput = z.infer<typeof shareMachineSchema>;
export type MetricQueryInput = z.infer<typeof metricQuerySchema>;

export const downloadQuerySchema = z.object({
  os: z.enum(["windows", "linux", "darwin"]),
  arch: z.enum(["amd64", "arm64"]),
  type: z.enum(["zip", "config"]).default("config"),
});

export type DownloadQueryInput = z.infer<typeof downloadQuerySchema>;
