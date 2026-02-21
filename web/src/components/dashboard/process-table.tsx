"use client";

import { cn } from "@/lib/utils";
import { formatPercentage } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ProcessEntry } from "@/types/metrics";

interface ProcessTableProps {
  processes: ProcessEntry[];
}

export function ProcessTable({ processes }: ProcessTableProps) {
  if (processes.length === 0) {
    return <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">No process data available</div>;
  }

  const sorted = [...processes].sort((a, b) => b.cpu - a.cpu);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>PID</TableHead>
          <TableHead>Name</TableHead>
          <TableHead className="text-right">CPU%</TableHead>
          <TableHead className="text-right">Memory %</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((proc, index) => (
          <TableRow key={`${proc.pid}-${index}`}>
            <TableCell className="font-mono text-xs">{proc.pid}</TableCell>
            <TableCell className="truncate max-w-[200px]">{proc.name}</TableCell>
            <TableCell className="text-right font-mono">
              <span className={cn(proc.cpu >= 80 ? "text-red-400" : proc.cpu >= 50 ? "text-amber-400" : "")}>{formatPercentage(proc.cpu)}</span>
            </TableCell>
            <TableCell className="text-right font-mono">{proc.memory.toFixed(1)}%</TableCell>
            <TableCell>
              <Badge variant={proc.status === "running" ? "success" : proc.status === "sleeping" ? "secondary" : "warning"}>{proc.status}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
