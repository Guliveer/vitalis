"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

// ---------------------------------------------------------------------------
// Platform options & auto-detection
// ---------------------------------------------------------------------------

interface PlatformOption {
  label: string;
  value: string;
  os: string;
  arch: string;
}

const PLATFORM_OPTIONS: PlatformOption[] = [
  { label: "macOS (Apple Silicon)", value: "darwin-arm64", os: "darwin", arch: "arm64" },
  { label: "macOS (Intel)", value: "darwin-amd64", os: "darwin", arch: "amd64" },
  { label: "Linux (x86_64)", value: "linux-amd64", os: "linux", arch: "amd64" },
  { label: "Windows (x86_64)", value: "windows-amd64", os: "windows", arch: "amd64" },
];

function detectPlatform(): string {
  if (typeof navigator === "undefined") return PLATFORM_OPTIONS[0].value;

  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows-amd64";
  if (ua.includes("mac")) return "darwin-arm64";
  return "linux-amd64";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AddMachineDialog({ onMachineCreated }: { onMachineCreated?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [machineId, setMachineId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Download state
  const [platform, setPlatform] = useState<string>("");
  const [downloading, setDownloading] = useState<"zip" | "config" | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Auto-detect platform on mount (client-side only)
  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  // ---------------------------------------------------------------------------
  // Machine creation
  // ---------------------------------------------------------------------------

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
      setMachineId(data.data.machine.id);
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
    setMachineId(null);
    setCopied(false);
    setDownloading(null);
    setDownloadError(null);
    onMachineCreated?.();
    router.refresh();
  }

  // ---------------------------------------------------------------------------
  // Agent download
  // ---------------------------------------------------------------------------

  const handleDownload = useCallback(
    async (type: "zip" | "config") => {
      if (!machineId) return;

      const selected = PLATFORM_OPTIONS.find((p) => p.value === platform);
      if (!selected) return;

      setDownloading(type);
      setDownloadError(null);

      try {
        const params = new URLSearchParams({
          os: selected.os,
          arch: selected.arch,
          type,
        });

        const res = await fetch(`/api/machines/${machineId}/download?${params.toString()}`, {
          credentials: "include",
        });

        if (!res.ok) {
          if (res.status === 404 && type === "zip") {
            setDownloadError('Pre-built binary not available for this platform. Try "Download Config Only" instead.');
          } else {
            const body = await res.json().catch(() => null);
            setDownloadError(body?.error ?? `Download failed (${res.status})`);
          }
          return;
        }

        // Create a blob from the response and trigger a download
        const blob = await res.blob();
        const disposition = res.headers.get("Content-Disposition");
        let filename = type === "zip" ? `vitalis-agent-${selected.os}-${selected.arch}.zip` : "vitalis-config.yaml";

        if (disposition) {
          const match = disposition.match(/filename="?([^"]+)"?/);
          if (match?.[1]) filename = match[1];
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch {
        setDownloadError("Network error during download. Please try again.");
      } finally {
        setDownloading(null);
      }
    },
    [machineId, platform],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

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
              {/* Token display — unchanged */}
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

              {/* Download agent section */}
              <Separator />

              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Download Pre-configured Agent</p>
                  <p className="text-xs text-muted-foreground">Download the agent with your server URL and token pre-configured.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="platform-select" className="text-xs">
                    Platform
                  </Label>
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger id="platform-select" className="w-full">
                      <SelectValue placeholder="Select platform" />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORM_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" disabled={downloading !== null} onClick={() => handleDownload("zip")}>
                    {downloading === "zip" ? <Loader2 className="animate-spin" /> : <Download className="size-4" />}
                    {downloading === "zip" ? "Downloading…" : "Download ZIP"}
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" disabled={downloading !== null} onClick={() => handleDownload("config")}>
                    {downloading === "config" ? <Loader2 className="animate-spin" /> : <FileText className="size-4" />}
                    {downloading === "config" ? "Downloading…" : "Config Only"}
                  </Button>
                </div>

                {downloadError && (
                  <Alert variant="destructive" className="py-2">
                    <AlertDescription className="text-xs">{downloadError}</AlertDescription>
                  </Alert>
                )}
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
