"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { usePolling } from "@/hooks/use-polling";
import { authFetch } from "@/lib/auth/fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CpuChart } from "@/components/charts/cpu-chart";
import CpuCoresChart from "@/components/charts/cpu-cores-chart";
import { RamChart } from "@/components/charts/ram-chart";
import TemperatureChart from "@/components/charts/temperature-chart";
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
  const [processes, setProcesses] = useState<ProcessEntry[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState("");

  // Track whether data has been loaded at least once
  const hasDataRef = useRef(false);
  // Track the last successfully fetched range to detect range changes
  const lastFetchedRangeRef = useRef<number | null>(null);

  const fetchMetrics = useCallback(
    async (hours: number) => {
      // Show loading skeleton only on initial load or when time range changes
      const isRangeChange = lastFetchedRangeRef.current !== null && lastFetchedRangeRef.current !== hours;
      if (!hasDataRef.current || isRangeChange) {
        setInitialLoading(true);
      }

      const to = new Date();
      const from = new Date(to.getTime() - hours * 60 * 60 * 1000);

      const resolution = hours <= 24 ? "raw" : "hourly";
      const includeProcesses = "true";

      try {
        const params = new URLSearchParams({
          from: from.toISOString(),
          to: to.toISOString(),
          resolution,
          include_processes: includeProcesses,
        });

        const res = await authFetch(`/api/machines/${machineId}/metrics?${params}`);
        const data = await res.json();

        if (!res.ok) {
          // Only set error if we have no data yet; otherwise keep showing stale data
          if (!hasDataRef.current) {
            setError(data.error || "Failed to fetch metrics");
          }
          return;
        }

        setMetrics(data.data?.metrics ?? []);
        setProcesses(data.data?.processes ?? []);
        setError("");
        hasDataRef.current = true;
        lastFetchedRangeRef.current = hours;
      } catch {
        // Only set error if we have no data yet
        if (!hasDataRef.current) {
          setError("Network error. Please try again.");
        }
      } finally {
        setInitialLoading(false);
      }
    },
    [machineId],
  );

  usePolling(
    useCallback(() => {
      fetchMetrics(selectedRange);
    }, [fetchMetrics, selectedRange]),
    30_000,
    [selectedRange],
  );

  const latestMetric = metrics.length > 0 ? metrics[0] : null;
  const latestDisk: DiskUsageEntry[] = latestMetric?.diskUsage && Array.isArray(latestMetric.diskUsage) ? latestMetric.diskUsage : [];

  // Memoised chart data transformations to avoid new array references on every render
  const cpuData = useMemo(() => metrics.map((m) => ({ timestamp: m.timestamp, cpuOverall: m.cpuOverall })), [metrics]);

  const cpuCoresData = useMemo(() => metrics.map((m) => ({ timestamp: m.timestamp, cpuCores: m.cpuCores })), [metrics]);

  const ramData = useMemo(() => metrics.map((m) => ({ timestamp: m.timestamp, ramUsed: m.ramUsed, ramTotal: m.ramTotal })), [metrics]);

  const temperatureData = useMemo(() => metrics.map((m) => ({ timestamp: m.timestamp, cpuTemp: m.cpuTemp, gpuTemp: m.gpuTemp })), [metrics]);

  const networkData = useMemo(() => metrics.map((m) => ({ timestamp: m.timestamp, networkRx: m.networkRx, networkTx: m.networkTx })), [metrics]);

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

      {initialLoading ? (
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
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            {/* Row 1: CPU Usage, Per-Core CPU Usage */}
            <Card>
              <CardHeader>
                <CardTitle>CPU Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <CpuChart data={cpuData} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Per-Core CPU Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <CpuCoresChart data={cpuCoresData} />
              </CardContent>
            </Card>

            {/* Row 2: RAM Usage, Temperature History */}
            <Card>
              <CardHeader>
                <CardTitle>RAM Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <RamChart data={ramData} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Temperature History</CardTitle>
              </CardHeader>
              <CardContent>
                <TemperatureChart data={temperatureData} />
              </CardContent>
            </Card>

            {/* Row 3: Network I/O, Disk Usage */}
            <Card>
              <CardHeader>
                <CardTitle>Network I/O</CardTitle>
              </CardHeader>
              <CardContent>
                <NetworkChart data={networkData} />
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
          {processes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Top Processes</CardTitle>
              </CardHeader>
              <CardContent>
                <ProcessTable processes={processes} />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
