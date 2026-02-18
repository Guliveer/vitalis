"use client";

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { formatBytes } from "@/lib/utils/format";

interface RamDataPoint {
  timestamp: string;
  ramUsed: number | null;
  ramTotal: number | null;
}

interface RamChartProps {
  data: RamDataPoint[];
}

function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function RamChart({ data }: RamChartProps) {
  if (data.length === 0) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No RAM data available</div>;
  }

  const maxRam = Math.max(...data.map((d) => d.ramTotal ?? 0));

  const chartData = [...data].reverse().map((d) => ({
    time: formatTime(d.timestamp),
    used: d.ramUsed ?? 0,
    total: d.ramTotal ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={256}>
      <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="time" tick={{ fontSize: 12 }} tickLine={false} className="text-muted-foreground" axisLine={false} />
        <YAxis domain={[0, maxRam]} tick={{ fontSize: 12 }} tickLine={false} className="text-muted-foreground" axisLine={false} tickFormatter={(v: number) => formatBytes(v)} />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            color: "hsl(var(--foreground))",
          }}
          formatter={(value: number | undefined, name: string | undefined) => [formatBytes(value ?? 0), name === "used" ? "Used" : "Total"]}
        />
        <Area type="monotone" dataKey="used" stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
