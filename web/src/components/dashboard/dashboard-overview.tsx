"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { usePolling } from "@/hooks/use-polling";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPercentage, formatBytes, formatRelativeTime } from "@/lib/utils/format";
import { Monitor, Cpu, MemoryStick, Wifi } from "lucide-react";
import type { MachineWithStatus } from "@/types/machines";

const POLL_INTERVAL = 30_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getColorClass(value: number): string {
  if (value >= 90) return "text-red-400";
  if (value >= 70) return "text-amber-400";
  return "text-emerald-400";
}

function safeAverage(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCardSkeleton() {
  return (
    <Card className="py-4">
      <CardContent className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

function TableSkeleton() {
  return (
    <Card>
      <CardContent className="py-2">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
}

function SummaryCard({ icon, label, value, subtitle }: SummaryCardProps) {
  return (
    <Card className="py-4">
      <CardContent className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold leading-tight mt-0.5">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DashboardOverview() {
  const router = useRouter();
  const [machines, setMachines] = useState<MachineWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchMachines = useCallback(async () => {
    try {
      const res = await fetch("/api/machines");
      if (!res.ok) throw new Error("Failed to fetch machines");
      const data = await res.json();
      setMachines(data.data?.machines ?? []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch machines");
    } finally {
      setLoading(false);
    }
  }, []);

  usePolling(fetchMachines, POLL_INTERVAL);

  // ---- Aggregated stats ---------------------------------------------------

  const onlineMachines = machines.filter((m) => m.isOnline);
  const totalCount = machines.length;
  const onlineCount = onlineMachines.length;
  const offlineCount = totalCount - onlineCount;

  const cpuValues = onlineMachines.filter((m) => m.lastMetric?.cpuOverall != null).map((m) => m.lastMetric!.cpuOverall);
  const avgCpu = safeAverage(cpuValues);

  const ramPercentValues = onlineMachines.filter((m) => m.lastMetric?.ramUsed != null && m.lastMetric?.ramTotal != null && m.lastMetric.ramTotal > 0).map((m) => (m.lastMetric!.ramUsed / m.lastMetric!.ramTotal) * 100);
  const avgRamPercent = safeAverage(ramPercentValues);

  const onlineRate = totalCount > 0 ? (onlineCount / totalCount) * 100 : 0;

  // Sort: online first, then alphabetically by name
  const sortedMachines = [...machines].sort((a, b) => {
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // ---- Loading state ------------------------------------------------------

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <SummaryCardSkeleton key={i} />
          ))}
        </div>
        <TableSkeleton />
      </div>
    );
  }

  // ---- Error state --------------------------------------------------------

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  // ---- Content ------------------------------------------------------------

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">High-level overview across all machines</p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {/* Total Machines */}
        <SummaryCard icon={<Monitor className="h-5 w-5 text-muted-foreground" />} label="Total Machines" value={totalCount} subtitle={totalCount > 0 ? `${onlineCount} online · ${offlineCount} offline` : "No machines registered"} />

        {/* Average CPU */}
        <SummaryCard icon={<Cpu className="h-5 w-5 text-muted-foreground" />} label="Average CPU" value={avgCpu != null ? <span className={getColorClass(avgCpu)}>{formatPercentage(avgCpu)}</span> : <span className="text-muted-foreground">N/A</span>} subtitle={avgCpu != null ? `Across ${cpuValues.length} online machine${cpuValues.length !== 1 ? "s" : ""}` : "No metrics available"} />

        {/* Average RAM */}
        <SummaryCard icon={<MemoryStick className="h-5 w-5 text-muted-foreground" />} label="Average RAM" value={avgRamPercent != null ? <span className={getColorClass(avgRamPercent)}>{formatPercentage(avgRamPercent)}</span> : <span className="text-muted-foreground">N/A</span>} subtitle={avgRamPercent != null ? `Across ${ramPercentValues.length} online machine${ramPercentValues.length !== 1 ? "s" : ""}` : "No metrics available"} />

        {/* Online Rate */}
        <SummaryCard icon={<Wifi className="h-5 w-5 text-muted-foreground" />} label="Online Rate" value={totalCount > 0 ? <span className={getColorClass(100 - onlineRate)}>{formatPercentage(onlineRate)}</span> : <span className="text-muted-foreground">N/A</span>} subtitle={totalCount > 0 ? `${onlineCount}/${totalCount} Online` : "No machines registered"} />
      </div>

      {/* Machine status table */}
      {sortedMachines.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_100px_90px_90px_110px] gap-2 px-4 py-3 border-b text-xs font-medium text-muted-foreground">
              <span>Machine</span>
              <span>Status</span>
              <span className="text-right">CPU</span>
              <span className="text-right">RAM</span>
              <span className="text-right">Last Seen</span>
            </div>

            {/* Table rows */}
            {sortedMachines.map((machine) => {
              const cpuPercent = machine.lastMetric?.cpuOverall ?? null;
              const ramUsed = machine.lastMetric?.ramUsed ?? null;
              const ramTotal = machine.lastMetric?.ramTotal ?? null;
              const ramPercent = ramUsed != null && ramTotal != null && ramTotal > 0 ? (ramUsed / ramTotal) * 100 : null;

              return (
                <div
                  key={machine.id}
                  className="grid grid-cols-[1fr_100px_90px_90px_110px] gap-2 px-4 py-3 border-b last:border-b-0 items-center cursor-pointer transition-colors hover:bg-muted/50"
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(`/machines/${machine.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/machines/${machine.id}`);
                    }
                  }}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{machine.name}</p>
                    {machine.os && (
                      <p className="text-xs text-muted-foreground truncate">
                        {machine.os}
                        {machine.arch ? ` · ${machine.arch}` : ""}
                      </p>
                    )}
                  </div>

                  <div>
                    <Badge variant={machine.isOnline ? "success" : "danger"}>{machine.isOnline ? "Online" : "Offline"}</Badge>
                  </div>

                  <div className="text-right text-sm">{cpuPercent != null ? <span className={getColorClass(cpuPercent)}>{formatPercentage(cpuPercent)}</span> : <span className="text-muted-foreground">—</span>}</div>

                  <div className="text-right text-sm">{ramPercent != null ? <span className={getColorClass(ramPercent)}>{formatPercentage(ramPercent)}</span> : <span className="text-muted-foreground">—</span>}</div>

                  <div className="text-right text-xs text-muted-foreground">{machine.lastSeen ? formatRelativeTime(machine.lastSeen) : "Never"}</div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Monitor className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">No machines yet</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm">Add your first machine from the Machines page to start monitoring.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
