import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { MachineMetricsView } from "@/components/dashboard/machine-metrics-view";
import { formatRelativeTime } from "@/lib/utils/format";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { machines, machineAccess } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { Machine } from "@/types/machines";

export const dynamic = "force-dynamic";

async function getMachine(id: string): Promise<Omit<Machine, "machineToken"> | null> {
  try {
    const session = await getSession();
    if (!session) return null;

    const db = getDb();

    const [machine] = await db.select().from(machines).where(eq(machines.id, id)).limit(1);
    if (!machine) return null;

    // Admin bypass: admins have access to all machines
    if (session.role !== "ADMIN" && machine.userId !== session.sub) {
      // Check shared access
      const [access] = await db
        .select()
        .from(machineAccess)
        .where(and(eq(machineAccess.machineId, id), eq(machineAccess.userId, session.sub)))
        .limit(1);

      if (!access) return null;
    }

    // Strip machineToken from response (same as API route)
    const { machineToken, ...machineData } = machine;
    return machineData;
  } catch (error) {
    console.error("getMachine error:", error);
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
          {(machine.osName || machine.os) && (
            <Badge variant="secondary">
              {machine.osName || machine.os}
              {machine.osVersion ? ` ${machine.osVersion}` : ""}
            </Badge>
          )}
          {machine.arch && <Badge variant="secondary">{machine.arch}</Badge>}
        </div>
        {machine.lastSeen && <p className="text-sm text-muted-foreground">Last seen {formatRelativeTime(machine.lastSeen)}</p>}
      </div>

      {/* Metrics View */}
      <MachineMetricsView machineId={id} />
    </div>
  );
}
