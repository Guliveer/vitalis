// GET /api/machines/[id]/download — download agent config (YAML) or bundled package (ZIP)
//
// Pre-built agent binaries should be placed in web/public/downloads/ with the naming convention:
//   vitalis-agent-<os>-<arch>[.exe]
// For example: vitalis-agent-linux-amd64, vitalis-agent-windows-amd64.exe

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { machines } from "@/lib/db/schema";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { downloadQuerySchema } from "@/lib/validation/machines";
import { errorResponse } from "@/lib/utils/response";
import { eq } from "drizzle-orm";
import path from "path";
import fs from "fs/promises";
import JSZip from "jszip";

/**
 * Resolve the application URL for the agent config.
 * Checks APP_URL, NEXT_PUBLIC_APP_URL, and VERCEL_URL (with https:// prefix) in order.
 */
function getAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/**
 * Generate the agent.yaml configuration content for a given machine token.
 */
function generateAgentConfig(machineToken: string): string {
  const serverUrl = getAppUrl();

  return `server:
  url: "${serverUrl}"
  machine_token: "${machineToken}"

collection:
  interval: 15s
  batch_interval: 30s
  top_processes: 10

logging:
  level: info
`;
}

/**
 * Build the binary filename for a given OS and architecture.
 * Appends .exe for Windows targets.
 */
function getBinaryFilename(os: string, arch: string): string {
  const base = `vitalis-agent-${os}-${arch}`;
  return os === "windows" ? `${base}.exe` : base;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withAuth(async (_req: NextRequest, { user }: AuthContext): Promise<NextResponse> => {
    try {
      const { id: machineId } = await context.params;

      // Parse and validate query parameters
      const url = new URL(_req.url);
      const queryParams = {
        os: url.searchParams.get("os"),
        arch: url.searchParams.get("arch"),
        type: url.searchParams.get("type") ?? undefined,
      };

      const parsed = downloadQuerySchema.safeParse(queryParams);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
        return errorResponse(`Invalid query parameters: ${issues.join("; ")}`, 400);
      }

      const { os: targetOs, arch: targetArch, type: downloadType } = parsed.data;

      // Look up the machine and verify ownership
      const db = getDb();
      const [machine] = await db.select().from(machines).where(eq(machines.id, machineId)).limit(1);

      if (!machine || machine.userId !== user.sub) {
        return errorResponse("Machine not found", 404);
      }

      // Generate the agent config YAML
      const configContent = generateAgentConfig(machine.machineToken);

      // --- Config-only download ---
      if (downloadType === "config") {
        return new NextResponse(configContent, {
          status: 200,
          headers: {
            "Content-Type": "application/x-yaml",
            "Content-Disposition": 'attachment; filename="vitalis-config.yaml"',
          },
        });
      }

      // --- ZIP bundle download (binary + config) ---
      const binaryFilename = getBinaryFilename(targetOs, targetArch);
      const binaryPath = path.join(process.cwd(), "public", "downloads", binaryFilename);

      // Check if the binary exists
      let binaryData: Buffer;
      try {
        binaryData = (await fs.readFile(binaryPath)) as Buffer;
      } catch {
        return errorResponse(`Pre-built binary "${binaryFilename}" not found. Use type=config to download just the configuration file.`, 404);
      }

      // Create ZIP archive with binary + config
      const zip = new JSZip();
      zip.file(binaryFilename, binaryData);
      zip.file("vitalis-config.yaml", configContent);

      const zipArrayBuffer = await zip.generateAsync({ type: "arraybuffer" });

      const zipFilename = `vitalis-agent-${targetOs}-${targetArch}.zip`;

      return new NextResponse(zipArrayBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${zipFilename}"`,
        },
      });
    } catch (error) {
      console.error("Download agent error:", error);
      return errorResponse("Internal server error", 500);
    }
  })(request);
}
