import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { MachineMetricsView } from "@/components/dashboard/machine-metrics-view";
import { formatRelativeTime } from "@/lib/utils/format";
import type { Machine } from "@/types/machines";

interface MachineResponse {
  data?: {
    machine?: Machine;
  };
}

async function getMachine(id: string): Promise<Machine | null> {
  const cookieStore = await cookies();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    const res = await fetch(`${appUrl}/api/machines/${id}`, {
      headers: {
        cookie: cookieStore.toString(),
      },
      cache: "no-store",
    });

    if (!res.ok) return null;

    const data: MachineResponse = await res.json();
    return data.data?.machine ?? null;
  } catch {
    return null;
  }
}

export default async function MachineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const machine = await getMachine(id);

  if (!machine) {
    notFound();
  }

  const isOnline = machine.lastSeen ? Date.now() - new Date(machine.lastSeen).getTime() < 2 * 60 * 1000 : false;

  return (
    <div>
      {/* Machine Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold">{machine.name}</h1>
          <Badge variant={isOnline ? "success" : "danger"}>{isOnline ? "Online" : "Offline"}</Badge>
          {machine.os && <Badge variant="secondary">{machine.os}</Badge>}
          {machine.arch && <Badge variant="secondary">{machine.arch}</Badge>}
        </div>
        {machine.lastSeen && <p className="text-sm text-muted-foreground">Last seen {formatRelativeTime(machine.lastSeen)}</p>}
      </div>

      {/* Metrics View */}
      <MachineMetricsView machineId={id} />
    </div>
  );
}
