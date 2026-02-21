"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { formatPercentage } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ProcessEntry } from "@/types/metrics";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 15;

const ALL_STATUSES = "all";

/** Priority order for picking the "most active" status when grouping. */
const STATUS_PRIORITY: Record<string, number> = {
  running: 0,
  sleeping: 1,
  idle: 2,
  stopped: 3,
  zombie: 4,
  unknown: 5,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProcessTableProps {
  processes: ProcessEntry[];
}

interface GroupedProcess {
  name: string;
  instances: number;
  cpu: number;
  memory: number;
  status: string;
}

type SortColumn = "instances" | "name" | "cpu" | "memory" | "status";
type SortDirection = "asc" | "desc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Groups an array of processes by name, summing CPU / memory and picking the
 * most active status.
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

  return Array.from(map.values());
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

/** Compare two values for sorting, respecting direction. */
function compareGrouped(a: GroupedProcess, b: GroupedProcess, column: SortColumn, direction: SortDirection): number {
  let cmp = 0;

  switch (column) {
    case "instances":
      cmp = a.instances - b.instances;
      break;
    case "name":
      cmp = a.name.localeCompare(b.name);
      break;
    case "cpu":
      cmp = a.cpu - b.cpu;
      break;
    case "memory":
      cmp = a.memory - b.memory;
      break;
    case "status":
      cmp = a.status.localeCompare(b.status);
      break;
  }

  return direction === "asc" ? cmp : -cmp;
}

// ---------------------------------------------------------------------------
// Sort indicator component
// ---------------------------------------------------------------------------

function SortIndicator({ column, activeColumn, direction }: { column: SortColumn; activeColumn: SortColumn; direction: SortDirection }) {
  if (column !== activeColumn) {
    return <span className="ml-1 text-muted-foreground/40 select-none">▲</span>;
  }

  return <span className="ml-1 select-none">{direction === "asc" ? "▲" : "▼"}</span>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProcessTable({ processes }: ProcessTableProps) {
  // ---- State ----
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ALL_STATUSES);
  const [sortColumn, setSortColumn] = useState<SortColumn>("cpu");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [currentPage, setCurrentPage] = useState(1);

  // ---- Derived: unique statuses for the filter dropdown ----
  const uniqueStatuses = useMemo(() => {
    const statuses = new Set<string>();
    for (const proc of processes) {
      statuses.add(proc.status || "unknown");
    }
    return Array.from(statuses).sort();
  }, [processes]);

  // ---- Pipeline: filter → group → sort → paginate ----

  // 1. Filter raw processes by search query and status
  const filtered = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    return processes.filter((proc) => {
      // Search filter
      if (query && !proc.name.toLowerCase().includes(query)) {
        return false;
      }
      // Status filter
      if (statusFilter !== ALL_STATUSES && (proc.status || "unknown") !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [processes, searchQuery, statusFilter]);

  // 2. Group filtered processes by name
  const grouped = useMemo(() => groupByName(filtered), [filtered]);

  // 3. Sort grouped processes
  const sorted = useMemo(() => [...grouped].sort((a, b) => compareGrouped(a, b, sortColumn, sortDirection)), [grouped, sortColumn, sortDirection]);

  // 4. Paginate
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, safePage]);

  const rangeStart = sorted.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, sorted.length);

  // ---- Handlers ----

  /** Reset page to 1 whenever a filter/sort changes. */
  function resetPage() {
    setCurrentPage(1);
  }

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    resetPage();
  }

  function handleStatusFilterChange(value: string) {
    setStatusFilter(value);
    resetPage();
  }

  function handleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection(column === "name" || column === "status" ? "asc" : "desc");
    }
    resetPage();
  }

  // ---- Column header helper ----
  function SortableHeader({ column, label, className }: { column: SortColumn; label: string; className?: string }) {
    return (
      <TableHead className={className}>
        <button type="button" className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors cursor-pointer select-none" onClick={() => handleSort(column)}>
          {label}
          <SortIndicator column={column} activeColumn={sortColumn} direction={sortDirection} />
        </button>
      </TableHead>
    );
  }

  // ---- Render ----

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar: Search + Status filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <Input placeholder="Search processes..." value={searchQuery} onChange={(e) => handleSearchChange(e.target.value)} className="pl-8" />
        </div>

        <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
            {uniqueStatuses.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">{processes.length === 0 ? "No process data available" : "No processes match your filters"}</div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader column="instances" label="Instances" className="w-20 text-right" />
                <SortableHeader column="name" label="Name" />
                <SortableHeader column="cpu" label="CPU %" className="text-right" />
                <SortableHeader column="memory" label="Memory %" className="text-right" />
                <SortableHeader column="status" label="Status" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((group) => (
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

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {rangeStart}–{rangeEnd} of {sorted.length} {sorted.length === 1 ? "process" : "processes"}
            </span>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
                ← Prev
              </Button>
              <span className="min-w-16 text-center tabular-nums">
                {safePage} / {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>
                Next →
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
