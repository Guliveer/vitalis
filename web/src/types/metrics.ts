// Metric-related TypeScript types
// Uses Drizzle inferred types for database model alignment

import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type { metrics, processSnapshots, metricsHourly, metricsDaily } from "@/lib/db/schema";

export type Metric = InferSelectModel<typeof metrics>;
export type NewMetric = InferInsertModel<typeof metrics>;
export type ProcessSnapshot = InferSelectModel<typeof processSnapshots>;
export type NewProcessSnapshot = InferInsertModel<typeof processSnapshots>;
export type MetricHourly = InferSelectModel<typeof metricsHourly>;
export type MetricDaily = InferSelectModel<typeof metricsDaily>;

export interface DiskUsageEntry {
  mount: string;
  fs?: string;
  total: number;
  used: number;
  free: number;
}

export interface ProcessEntry {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  status: string;
}

export interface MetricBatch {
  machine_token: string;
  metrics: Array<{
    timestamp: string;
    cpu_overall: number;
    cpu_cores: number[];
    ram_used: number;
    ram_total: number;
    disk_usage: DiskUsageEntry[];
    network_rx: number;
    network_tx: number;
    uptime_seconds: number;
    cpu_temp?: number | null;
    gpu_temp?: number | null;
    processes: ProcessEntry[];
  }>;
}

export interface MetricQueryParams {
  machineId: string;
  from: string;
  to: string;
  resolution?: "raw" | "hourly" | "daily";
}
