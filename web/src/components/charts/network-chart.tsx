"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { formatBytes } from "@/lib/utils/format";

interface NetworkDataPoint {
  timestamp: string;
  networkRx: number | null;
  networkTx: number | null;
}

interface NetworkChartProps {
  data: NetworkDataPoint[];
}

function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function NetworkChart({ data }: NetworkChartProps) {
  if (data.length === 0) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No network data available</div>;
  }

  const chartData = [...data].reverse().map((d) => ({
    time: formatTime(d.timestamp),
    rx: d.networkRx ?? 0,
    tx: d.networkTx ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={256}>
      <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="time" tick={{ fontSize: 12 }} tickLine={false} className="text-muted-foreground" axisLine={false} />
        <YAxis tick={{ fontSize: 12 }} tickLine={false} className="text-muted-foreground" axisLine={false} tickFormatter={(v: number) => formatBytes(v)} />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            color: "hsl(var(--foreground))",
          }}
          formatter={(value: number | undefined, name: string | undefined) => [formatBytes(value ?? 0), name === "rx" ? "Download (RX)" : "Upload (TX)"]}
        />
        <Legend formatter={(value: string) => (value === "rx" ? "Download (RX)" : "Upload (TX)")} wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="rx" stroke="#22c55e" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        <Line type="monotone" dataKey="tx" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
