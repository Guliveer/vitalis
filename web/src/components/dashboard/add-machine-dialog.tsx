"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function AddMachineDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/machines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create machine");
        return;
      }

      setToken(data.data.machine.machineToken);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (token) {
      navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleClose() {
    setOpen(false);
    setName("");
    setError("");
    setToken(null);
    setCopied(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose();
        else setOpen(true);
      }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus />
          Add Machine
        </Button>
      </DialogTrigger>

      <DialogContent showCloseButton={false}>
        {!token ? (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Add New Machine</DialogTitle>
              <DialogDescription>Create a new machine entry to start monitoring.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="machine-name">Machine Name</Label>
                <Input id="machine-name" placeholder="e.g. Production Server" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div>
            <DialogHeader>
              <DialogTitle>Machine Created!</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <Alert className="border-amber-500/25 bg-amber-500/10">
                <AlertTitle className="text-amber-400">⚠️ Save this token — it will only be shown once</AlertTitle>
                <AlertDescription className="text-muted-foreground">Use this token in your agent configuration to connect this machine.</AlertDescription>
              </Alert>

              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-background border px-3 py-2 text-sm font-mono break-all">{token}</code>
                <Button variant="secondary" size="sm" onClick={handleCopy} className="shrink-0">
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
