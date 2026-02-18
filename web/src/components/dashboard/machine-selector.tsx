"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { MachineWithStatus } from "@/types/machines";

interface MachineSelectorProps {
  machines: MachineWithStatus[];
  currentMachineId?: string;
}

export function MachineSelector({ machines, currentMachineId }: MachineSelectorProps) {
  const router = useRouter();

  if (machines.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {machines.map((machine) => {
        const isActive = machine.id === currentMachineId;
        return (
          <Button key={machine.id} variant={isActive ? "default" : "outline"} size="sm" onClick={() => router.push(`/machines/${machine.id}`)} className={cn("gap-2 whitespace-nowrap", isActive && "bg-primary/10 text-primary border-primary hover:bg-primary/20")}>
            <span className={cn("h-2 w-2 rounded-full", machine.isOnline ? "bg-emerald-400" : "bg-red-400")} />
            {machine.name}
          </Button>
        );
      })}
    </div>
  );
}
