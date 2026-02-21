"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { BarChart3, ChevronDown, ChevronRight, Circle, LayoutDashboard, Loader2, LogOut, Menu, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { authFetch } from "@/lib/auth/fetch";
import { useAuthRefresh } from "@/hooks/use-auth-refresh";

interface SidebarMachine {
  id: string;
  name: string;
  isOnline: boolean;
}

const MACHINES_POLL_INTERVAL = 30_000;

function useMachines() {
  const [machines, setMachines] = useState<SidebarMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMachines = useCallback(async () => {
    try {
      const res = await authFetch("/api/machines");
      if (!res.ok) {
        throw new Error(`Failed to fetch machines (${res.status})`);
      }
      const data = await res.json();
      const list: SidebarMachine[] = (data.data?.machines ?? []).map((m: { id: string; name: string; isOnline: boolean }) => ({
        id: m.id,
        name: m.name,
        isOnline: m.isOnline,
      }));
      setMachines(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch machines");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMachines();
    const interval = setInterval(fetchMachines, MACHINES_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchMachines]);

  return { machines, loading, error, refetch: fetchMachines };
}

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
}

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Machines",
    href: "/machines",
    icon: Server,
  },
];

function MachinesDropdown({ expanded, onToggle, onNavigate }: { expanded: boolean; onToggle: () => void; onNavigate: () => void }) {
  const pathname = usePathname();
  const { machines, loading, error } = useMachines();

  // Extract current machine ID from path like /machines/abc-123
  const currentMachineId = pathname.startsWith("/machines/") ? (pathname.split("/")[2] ?? null) : null;

  return (
    <div>
      {/* Machines nav item with chevron toggle */}
      <div className="flex items-center">
        <Button variant="ghost" asChild className={cn("flex-1 justify-start gap-3", pathname === "/machines" || pathname.startsWith("/machines/") ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary" : "text-muted-foreground")}>
          <Link href="/machines" onClick={onNavigate}>
            <Server className="h-5 w-5" />
            Machines
          </Link>
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" onClick={onToggle} aria-label={expanded ? "Collapse machines list" : "Expand machines list"}>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>

      {/* Collapsible machine list */}
      {expanded && (
        <div className="ml-4 mt-1 max-h-48 space-y-0.5 overflow-y-auto pr-1">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading...
            </div>
          )}

          {!loading && error && <div className="px-3 py-2 text-xs text-destructive">{error}</div>}

          {!loading && !error && machines.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No machines found</div>}

          {!loading &&
            !error &&
            machines.map((machine) => {
              const isCurrentMachine = currentMachineId === machine.id;
              return (
                <Button key={machine.id} variant="ghost" size="sm" asChild className={cn("w-full justify-start gap-2 px-3 text-sm font-normal", isCurrentMachine ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary" : "text-muted-foreground")}>
                  <Link href={`/machines/${machine.id}`} onClick={onNavigate} title={machine.name}>
                    <Circle className={cn("h-2 w-2 shrink-0 fill-current", machine.isOnline ? "text-green-500" : "text-red-500")} />
                    <span className="truncate">{machine.name}</span>
                  </Link>
                </Button>
              );
            })}
        </div>
      )}
    </div>
  );
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  // Expand machines dropdown by default when on a /machines/* route
  const [machinesExpanded, setMachinesExpanded] = useState(pathname === "/machines" || pathname.startsWith("/machines/"));

  // Keep dropdown expanded when navigating to a machines route
  useEffect(() => {
    if (pathname === "/machines" || pathname.startsWith("/machines/")) {
      setMachinesExpanded(true);
    }
  }, [pathname]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await authFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore errors — redirect anyway
    }
    router.push("/login");
  }

  return (
    <>
      {/* Mobile overlay */}
      {open && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} aria-hidden="true" />}

      {/* Sidebar */}
      <aside className={cn("fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-card transition-transform duration-200 lg:static lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        {/* Branding */}
        <div className="flex h-16 items-center gap-2 px-6">
          <BarChart3 className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold">Vitalis</span>
        </div>

        <Separator />

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            // Render the Machines item with its dropdown
            if (item.href === "/machines") {
              return <MachinesDropdown key={item.label} expanded={machinesExpanded} onToggle={() => setMachinesExpanded((prev) => !prev)} onNavigate={onClose} />;
            }

            // Render standard nav items
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Button key={item.label} variant="ghost" asChild className={cn("w-full justify-start gap-3", isActive ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary" : "text-muted-foreground")}>
                <Link href={item.href} onClick={onClose}>
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              </Button>
            );
          })}
        </nav>

        <Separator />

        {/* Logout */}
        <div className="p-3">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-3 text-muted-foreground" onClick={handleLogout} disabled={loggingOut}>
            <LogOut className="h-5 w-5" />
            {loggingOut ? "Logging out..." : "Logout"}
          </Button>
        </div>
      </aside>
    </>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  useAuthRefresh();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 flex-col">
        {/* Mobile header */}
        <header className="flex h-16 items-center border-b px-4 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
            <Menu className="h-6 w-6" />
          </Button>
          <span className="ml-3 text-lg font-bold">Vitalis</span>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
