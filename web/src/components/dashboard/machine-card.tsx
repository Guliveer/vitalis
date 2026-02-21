"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime, formatPercentage, formatBytes, formatUptime } from "@/lib/utils/format";
import { Clock, Thermometer } from "lucide-react";
import type { MachineWithStatus } from "@/types/machines";

function safeFormatUptime(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  return formatUptime(seconds);
}

interface MachineCardProps {
  machine: MachineWithStatus;
}

export function MachineCard({ machine }: MachineCardProps) {
  const router = useRouter();

  const cpuPercent = machine.lastMetric?.cpuOverall ?? null;
  const ramUsed = machine.lastMetric?.ramUsed ?? null;
  const ramTotal = machine.lastMetric?.ramTotal ?? null;
  const ramPercent = ramUsed !== null && ramTotal !== null && ramTotal > 0 ? (ramUsed / ramTotal) * 100 : null;

  return (
    <Card
      className="cursor-pointer transition-colors hover:border-primary/50 py-4"
      onClick={() => router.push(`/machines/${machine.id}`)}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/machines/${machine.id}`);
        }
      }}>
      <CardHeader className="pb-0 pt-0">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold truncate">{machine.name}</h3>
            {machine.lastSeen && <p className="text-xs text-muted-foreground mt-0.5">{formatRelativeTime(machine.lastSeen)}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {machine.os && <Badge variant="secondary">{machine.os}</Badge>}
            <Badge variant={machine.isOnline ? "success" : "danger"}>{machine.isOnline ? "Online" : "Offline"}</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Metrics */}
        {machine.lastMetric ? (
          <div className="space-y-2.5">
            {/* CPU */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">CPU</span>
                <span>{cpuPercent !== null ? formatPercentage(cpuPercent) : "N/A"}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${cpuPercent ?? 0}%` }} />
              </div>
            </div>

            {/* RAM */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">RAM</span>
                <span>{ramUsed !== null && ramTotal !== null ? `${formatBytes(ramUsed)} / ${formatBytes(ramTotal)}` : "N/A"}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${ramPercent ?? 0}%` }} />
              </div>
            </div>

            {/* Uptime & Temperature */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{safeFormatUptime(machine.lastMetric.uptimeSeconds)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Thermometer className="h-3 w-3" />
                <span>{machine.lastMetric.cpuTemp != null ? `${machine.lastMetric.cpuTemp.toFixed(1)}°C` : "—"}</span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No metrics yet</p>
        )}
      </CardContent>
    </Card>
  );
}
