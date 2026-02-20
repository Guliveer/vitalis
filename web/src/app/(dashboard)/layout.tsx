"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { BarChart3, LayoutDashboard, LogOut, Menu, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const navItems = [
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

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
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
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
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

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
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
