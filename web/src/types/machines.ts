// Machine-related TypeScript types
// Uses Drizzle inferred types for database model alignment

import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type { machines, machineAccess } from "@/lib/db/schema";

export type Machine = InferSelectModel<typeof machines>;
export type NewMachine = InferInsertModel<typeof machines>;
export type MachineAccess = InferSelectModel<typeof machineAccess>;
export type NewMachineAccess = InferInsertModel<typeof machineAccess>;

export type MachinePermission = "READ" | "WRITE" | "ADMIN";

export interface MachineWithStatus extends Machine {
  isOnline: boolean;
  lastMetric?: {
    cpuOverall: number;
    ramUsed: number;
    ramTotal: number;
  };
}

export interface CreateMachineRequest {
  name: string;
  os?: string;
  arch?: string;
}
