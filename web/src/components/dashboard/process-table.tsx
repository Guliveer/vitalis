"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatPercentage } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ProcessEntry } from "@/types/metrics";

interface ProcessTableProps {
  processes: ProcessEntry[];
}

/** Priority order for picking the "most active" status when grouping. */
const STATUS_PRIORITY: Record<string, number> = {
  running: 0,
  sleeping: 1,
  idle: 2,
  stopped: 3,
  zombie: 4,
  unknown: 5,
};

interface GroupedProcess {
  name: string;
  instances: number;
  cpu: number;
  memory: number;
  status: string;
}

/**
 * Groups an array of processes by name, summing CPU / memory and picking the
 * most active status. Returns the groups sorted by total CPU descending.
 */
function groupByName(processes: ProcessEntry[]): GroupedProcess[] {
  const map = new Map<string, GroupedProcess>();

  for (const proc of processes) {
    const existing = map.get(proc.name);
    if (existing) {
      existing.instances += 1;
      existing.cpu += proc.cpu;
      existing.memory += proc.memory;

      // Keep the "most active" status (lowest priority number wins).
      const curPriority = STATUS_PRIORITY[existing.status] ?? 5;
      const newPriority = STATUS_PRIORITY[proc.status] ?? 5;
      if (newPriority < curPriority) {
        existing.status = proc.status;
      }
    } else {
      map.set(proc.name, {
        name: proc.name,
        instances: 1,
        cpu: proc.cpu,
        memory: proc.memory,
        status: proc.status || "unknown",
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.cpu - a.cpu);
}

function statusVariant(status: string) {
  switch (status) {
    case "running":
      return "success" as const;
    case "sleeping":
    case "idle":
      return "secondary" as const;
    case "stopped":
    case "zombie":
      return "warning" as const;
    default:
      return "outline" as const;
  }
}

export function ProcessTable({ processes }: ProcessTableProps) {
  const grouped = useMemo(() => groupByName(processes), [processes]);

  if (grouped.length === 0) {
    return <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">No process data available</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20 text-right">Instances</TableHead>
          <TableHead>Name</TableHead>
          <TableHead className="text-right">CPU %</TableHead>
          <TableHead className="text-right">Memory %</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {grouped.map((group) => (
          <TableRow key={group.name}>
            <TableCell className="text-right font-mono text-xs">
              {group.instances > 1 ? (
                <Badge variant="outline" className="font-mono">
                  {group.instances}
                </Badge>
              ) : (
                <span className="text-muted-foreground">1</span>
              )}
            </TableCell>
            <TableCell className="truncate max-w-50">{group.name}</TableCell>
            <TableCell className="text-right font-mono">
              <span className={cn(group.cpu >= 80 ? "text-red-400" : group.cpu >= 50 ? "text-amber-400" : "")}>{formatPercentage(group.cpu)}</span>
            </TableCell>
            <TableCell className="text-right font-mono">{group.memory.toFixed(1)}%</TableCell>
            <TableCell>
              <Badge variant={statusVariant(group.status)}>{group.status}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
