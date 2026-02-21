"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

interface TemperatureDataPoint {
  timestamp: string;
  cpuTemp: number | null;
  gpuTemp: number | null;
}

interface TemperatureChartProps {
  data: TemperatureDataPoint[];
}

function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function TemperatureChart({ data }: TemperatureChartProps) {
  if (data.length === 0) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No temperature data available</div>;
  }

  const hasAnyTemp = data.some((d) => d.cpuTemp !== null || d.gpuTemp !== null);
  if (!hasAnyTemp) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No temperature data available</div>;
  }

  const chartData = [...data].reverse().map((d) => ({
    time: formatTime(d.timestamp),
    cpuTemp: d.cpuTemp ?? undefined,
    gpuTemp: d.gpuTemp ?? undefined,
  }));

  return (
    <ResponsiveContainer width="100%" height={256}>
      <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="time" tick={{ fontSize: 12 }} tickLine={false} className="text-muted-foreground" axisLine={false} />
        <YAxis domain={["auto", "auto"]} tick={{ fontSize: 12 }} tickLine={false} className="text-muted-foreground" axisLine={false} tickFormatter={(v: number) => `${v}°C`} />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            color: "hsl(var(--foreground))",
          }}
          formatter={(value: number | undefined, name: string | undefined) => {
            const label = name === "cpuTemp" ? "CPU Temp" : "GPU Temp";
            return [value !== undefined ? `${value.toFixed(1)}°C` : "N/A", label];
          }}
        />
        <Legend formatter={(value: string) => (value === "cpuTemp" ? "CPU Temp" : "GPU Temp")} wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="cpuTemp" stroke="#f97316" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#f97316" }} connectNulls />
        <Line type="monotone" dataKey="gpuTemp" stroke="#a855f7" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#a855f7" }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}
