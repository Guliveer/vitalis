"use client";

import { useState, useCallback } from "react";
import { usePolling } from "@/hooks/use-polling";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CpuChart } from "@/components/charts/cpu-chart";
import { RamChart } from "@/components/charts/ram-chart";
import { DiskChart } from "@/components/charts/disk-chart";
import { NetworkChart } from "@/components/charts/network-chart";
import { CurrentStatePanel } from "@/components/dashboard/current-state-panel";
import { ProcessTable } from "@/components/dashboard/process-table";
import type { DiskUsageEntry, ProcessEntry } from "@/types/metrics";

interface MetricRow {
  id: string;
  machineId: string;
  timestamp: string;
  cpuOverall: number | null;
  cpuCores: number[] | null;
  ramUsed: number | null;
  ramTotal: number | null;
  diskUsage: DiskUsageEntry[] | null;
  networkRx: number | null;
  networkTx: number | null;
  uptimeSeconds: number | null;
  cpuTemp: number | null;
  gpuTemp: number | null;
  processes?: ProcessEntry[] | null;
}

interface MachineMetricsViewProps {
  machineId: string;
}

const TIME_RANGES = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
] as const;

export function MachineMetricsView({ machineId }: MachineMetricsViewProps) {
  const [selectedRange, setSelectedRange] = useState(1);
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchMetrics = useCallback(
    async (hours: number) => {
      setLoading(true);
      setError("");

      const to = new Date();
      const from = new Date(to.getTime() - hours * 60 * 60 * 1000);

      const resolution = hours <= 24 ? "raw" : "hourly";
      const includeProcesses = hours <= 1 ? "true" : "false";

      try {
        const params = new URLSearchParams({
          from: from.toISOString(),
          to: to.toISOString(),
          resolution,
          include_processes: includeProcesses,
        });

        const res = await fetch(`/api/machines/${machineId}/metrics?${params}`);
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Failed to fetch metrics");
          return;
        }

        setMetrics(data.data?.metrics ?? []);
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [machineId],
  );

  usePolling(
    useCallback(() => {
      fetchMetrics(selectedRange);
    }, [fetchMetrics, selectedRange]),
    30_000,
  );

  const latestMetric = metrics.length > 0 ? metrics[0] : null;
  const latestProcesses: ProcessEntry[] = latestMetric?.processes && Array.isArray(latestMetric.processes) ? latestMetric.processes : [];
  const latestDisk: DiskUsageEntry[] = latestMetric?.diskUsage && Array.isArray(latestMetric.diskUsage) ? latestMetric.diskUsage : [];

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <Tabs value={String(selectedRange)} onValueChange={(val) => setSelectedRange(Number(val))} className="w-fit">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Time Range:</span>
          <TabsList>
            {TIME_RANGES.map((range) => (
              <TabsTrigger key={range.label} value={String(range.hours)}>
                {range.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="space-y-6">
          {/* Skeleton for current state */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          {/* Skeleton for charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-80 rounded-xl" />
            ))}
          </div>
        </div>
      ) : metrics.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p className="text-lg font-medium">No metrics in this time range</p>
          <p className="text-sm mt-1">Try selecting a different time range or wait for the agent to send data.</p>
        </div>
      ) : (
        <>
          {/* Current State */}
          <section>
            <h2 className="text-lg font-semibold mb-3">Current State</h2>
            <CurrentStatePanel
              data={
                latestMetric
                  ? {
                      cpuOverall: latestMetric.cpuOverall,
                      ramUsed: latestMetric.ramUsed,
                      ramTotal: latestMetric.ramTotal,
                      uptimeSeconds: latestMetric.uptimeSeconds,
                      cpuTemp: latestMetric.cpuTemp,
                      gpuTemp: latestMetric.gpuTemp,
                      diskUsage: latestDisk,
                    }
                  : null
              }
            />
          </section>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>CPU Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <CpuChart
                  data={metrics.map((m) => ({
                    timestamp: m.timestamp,
                    cpuOverall: m.cpuOverall,
                  }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>RAM Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <RamChart
                  data={metrics.map((m) => ({
                    timestamp: m.timestamp,
                    ramUsed: m.ramUsed,
                    ramTotal: m.ramTotal,
                  }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Network I/O</CardTitle>
              </CardHeader>
              <CardContent>
                <NetworkChart
                  data={metrics.map((m) => ({
                    timestamp: m.timestamp,
                    networkRx: m.networkRx,
                    networkTx: m.networkTx,
                  }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Disk Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <DiskChart data={latestDisk} />
              </CardContent>
            </Card>
          </div>

          {/* Process Table */}
          {latestProcesses.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Top Processes</CardTitle>
              </CardHeader>
              <CardContent>
                <ProcessTable processes={latestProcesses} />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
