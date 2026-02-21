"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatUptime, formatPercentage, formatTemperature } from "@/lib/utils/format";
import type { DiskUsageEntry } from "@/types/metrics";

interface CurrentStateData {
  cpuOverall: number | null;
  ramUsed: number | null;
  ramTotal: number | null;
  uptimeSeconds: number | null;
  cpuTemp: number | null;
  gpuTemp: number | null;
  diskUsage: DiskUsageEntry[] | null;
}

interface CurrentStatePanelProps {
  data: CurrentStateData | null;
}

function cpuColor(percent: number): string {
  if (percent >= 90) return "text-red-400";
  if (percent >= 70) return "text-amber-400";
  return "text-emerald-400";
}

export function CurrentStatePanel({ data }: CurrentStatePanelProps) {
  if (!data) {
    return (
      <Card className="py-4">
        <CardContent>
          <p className="text-sm text-muted-foreground">No current data available</p>
        </CardContent>
      </Card>
    );
  }

  const ramPercent = data.ramUsed !== null && data.ramTotal !== null && data.ramTotal > 0 ? (data.ramUsed / data.ramTotal) * 100 : null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {/* CPU */}
      <Card className="py-3">
        <CardContent>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">CPU</span>
            {data.cpuOverall !== null && <Badge variant={data.cpuOverall >= 90 ? "danger" : data.cpuOverall >= 70 ? "warning" : "success"}>{formatPercentage(data.cpuOverall)}</Badge>}
          </div>
          <p className={`text-2xl font-bold mt-1 ${data.cpuOverall !== null ? cpuColor(data.cpuOverall) : ""}`}>{data.cpuOverall !== null ? formatPercentage(data.cpuOverall) : "N/A"}</p>
        </CardContent>
      </Card>

      {/* RAM */}
      <Card className="py-3">
        <CardContent>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">RAM</span>
            {ramPercent !== null && <Badge variant={ramPercent >= 90 ? "danger" : ramPercent >= 70 ? "warning" : "success"}>{formatPercentage(ramPercent)}</Badge>}
          </div>
          <p className="text-2xl font-bold mt-1">{data.ramUsed !== null ? formatBytes(data.ramUsed) : "N/A"}</p>
          {data.ramTotal !== null && <p className="text-xs text-muted-foreground">of {formatBytes(data.ramTotal)}</p>}
        </CardContent>
      </Card>

      {/* Uptime */}
      <Card className="py-3">
        <CardContent>
          <span className="text-sm text-muted-foreground">Uptime</span>
          <p className="text-2xl font-bold mt-1">{data.uptimeSeconds !== null ? formatUptime(data.uptimeSeconds) : "N/A"}</p>
        </CardContent>
      </Card>

      {/* CPU Temp */}
      <Card className="py-3">
        <CardContent>
          <span className="text-sm text-muted-foreground">CPU Temp</span>
          <p className="text-2xl font-bold mt-1">{formatTemperature(data.cpuTemp)}</p>
        </CardContent>
      </Card>

      {/* GPU Temp */}
      <Card className="py-3">
        <CardContent>
          <span className="text-sm text-muted-foreground">GPU Temp</span>
          <p className="text-2xl font-bold mt-1">{formatTemperature(data.gpuTemp)}</p>
        </CardContent>
      </Card>

      {/* Disk Usage */}
      {data.diskUsage && data.diskUsage.length > 0 && (
        <Card className="sm:col-span-2 lg:col-span-1 py-3">
          <CardContent>
            <span className="text-sm text-muted-foreground mb-2 block">Disk</span>
            <div className="space-y-2">
              {data.diskUsage.map((disk) => {
                const percent = disk.total > 0 ? (disk.used / disk.total) * 100 : 0;
                return (
                  <div key={disk.mount}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-mono">
                        {disk.mount}
                        {disk.fs && <span className="ml-1 text-[10px] text-muted-foreground font-sans">{disk.fs}</span>}
                      </span>
                      <span>
                        {formatBytes(disk.used)} / {formatBytes(disk.total)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${percent > 90 ? "bg-red-500" : percent > 75 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
