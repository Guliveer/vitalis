"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import { formatBytes } from "@/lib/utils/format";
import type { DiskUsageEntry } from "@/types/metrics";

interface DiskChartProps {
  data: DiskUsageEntry[];
}

export function DiskChart({ data }: DiskChartProps) {
  if (data.length === 0) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No disk data available</div>;
  }

  const chartData = data.map((d) => ({
    mount: d.fs ? `${d.mount} (${d.fs})` : d.mount,
    used: d.used,
    free: d.free,
    total: d.total,
    usedPercent: d.total > 0 ? (d.used / d.total) * 100 : 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={256}>
      <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="mount" tick={{ fontSize: 12 }} tickLine={false} className="text-muted-foreground" axisLine={false} />
        <YAxis tick={{ fontSize: 12 }} tickLine={false} className="text-muted-foreground" axisLine={false} tickFormatter={(v: number) => formatBytes(v)} />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            color: "hsl(var(--foreground))",
          }}
          formatter={(value: number | undefined, name: string | undefined) => [formatBytes(value ?? 0), name === "used" ? "Used" : "Free"]}
        />
        <Bar dataKey="used" stackId="disk" radius={[0, 0, 0, 0]}>
          {chartData.map((entry, index) => (
            <Cell key={`used-${index}`} fill={entry.usedPercent > 90 ? "#ef4444" : entry.usedPercent > 75 ? "#f59e0b" : "#3b82f6"} />
          ))}
        </Bar>
        <Bar dataKey="free" stackId="disk" fill="#27272a" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
