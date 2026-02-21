"use client";

import { useState, useCallback } from "react";
import { Server } from "lucide-react";
import { usePolling } from "@/hooks/use-polling";
import { MachineCard } from "./machine-card";
import { AddMachineDialog } from "./add-machine-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { MachineWithStatus } from "@/types/machines";

const POLL_INTERVAL = 30_000;

export function MachineListView({ title }: { title: string }) {
  const [machines, setMachines] = useState<MachineWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchMachines = useCallback(async () => {
    try {
      const res = await fetch("/api/machines");
      if (!res.ok) {
        throw new Error("Failed to fetch machines");
      }
      const data = await res.json();
      setMachines(data.data?.machines ?? []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch machines");
    } finally {
      setLoading(false);
    }
  }, []);

  usePolling(fetchMachines, POLL_INTERVAL);

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[180px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
          </div>
        </div>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {machines.length} machine{machines.length !== 1 ? "s" : ""} registered
          </p>
        </div>
        <AddMachineDialog onMachineCreated={fetchMachines} />
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
          <p className="text-sm text-muted-foreground mb-4 text-center max-w-sm">Add your first machine to start monitoring its system metrics in real-time.</p>
          <AddMachineDialog onMachineCreated={fetchMachines} />
        </div>
      )}
    </div>
  );
}
