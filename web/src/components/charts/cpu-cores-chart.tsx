"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

interface CpuCoresDataPoint {
  timestamp: string;
  cpuCores: number[] | null;
}

interface CpuCoresChartProps {
  data: CpuCoresDataPoint[];
}

function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function generateCoreColor(index: number, total: number): string {
  const hue = Math.round((index * 360) / Math.max(total, 1));
  return `hsl(${hue}, 70%, 55%)`;
}

export default function CpuCoresChart({ data }: CpuCoresChartProps) {
  if (data.length === 0) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No per-core CPU data available</div>;
  }

  const coreCount = data.reduce((max, d) => Math.max(max, d.cpuCores?.length ?? 0), 0);

  if (coreCount === 0) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No per-core CPU data available</div>;
  }

  const chartData = [...data].reverse().map((d) => {
    const point: Record<string, string | number> = { time: formatTime(d.timestamp) };
    for (let i = 0; i < coreCount; i++) {
      point[`core${i}`] = d.cpuCores?.[i] ?? 0;
    }
    return point;
  });

  const colors = Array.from({ length: coreCount }, (_, i) => generateCoreColor(i, coreCount));

  return (
    <ResponsiveContainer width="100%" height={256}>
      <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="time" tick={{ fontSize: 12 }} tickLine={false} className="text-muted-foreground" axisLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} tickLine={false} className="text-muted-foreground" axisLine={false} tickFormatter={(v: number) => `${v}%`} />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            color: "hsl(var(--foreground))",
          }}
          formatter={(value: number | undefined, name: string | undefined) => {
            const coreIndex = name?.replace("core", "") ?? "";
            return [`${(value ?? 0).toFixed(1)}%`, `Core ${coreIndex}`];
          }}
        />
        <Legend formatter={(value: string) => `Core ${value.replace("core", "")}`} wrapperStyle={{ fontSize: 12 }} />
        {Array.from({ length: coreCount }, (_, i) => (
          <Line key={`core${i}`} type="monotone" dataKey={`core${i}`} stroke={colors[i]} strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: colors[i] }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
