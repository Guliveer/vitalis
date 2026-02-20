import { cookies } from "next/headers";
import { Server } from "lucide-react";
import { MachineCard } from "@/components/dashboard/machine-card";
import { AddMachineDialog } from "@/components/dashboard/add-machine-dialog";
import type { MachineWithStatus } from "@/types/machines";

async function getMachines(): Promise<MachineWithStatus[]> {
  const cookieStore = await cookies();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    const res = await fetch(`${appUrl}/api/machines`, {
      headers: {
        cookie: cookieStore.toString(),
      },
      cache: "no-store",
    });

    if (!res.ok) return [];

    const data = await res.json();
    return data.data?.machines ?? [];
  } catch {
    return [];
  }
}

export default async function MachinesPage() {
  const machines = await getMachines();

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Machines</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {machines.length} machine{machines.length !== 1 ? "s" : ""} registered
          </p>
        </div>
        <AddMachineDialog />
      </div>

      {/* Machine Grid */}
      {machines.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {machines.map((machine) => (
            <MachineCard key={machine.id} machine={machine} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 px-4">
          <Server className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-1">No machines yet</h3>
          <p className="text-sm text-muted-foreground mb-4 text-center max-w-sm">
            Add your first machine to start monitoring its system metrics in real-time.
          </p>
          <AddMachineDialog />
        </div>
      )}
    </div>
  );
}
