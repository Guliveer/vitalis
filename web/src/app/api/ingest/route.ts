// POST /api/ingest — metric ingestion endpoint for Go agents
// Accepts JSON batches authenticated via Authorization header or machine_token in body

import { NextRequest } from "next/server";
import { gunzipSync } from "zlib";
import { getDb } from "@/lib/db";
import { metrics, processSnapshots, machines } from "@/lib/db/schema";
import { metricBatchSchema } from "@/lib/validation/metrics";
import { successResponse, errorResponse } from "@/lib/utils/response";
import { checkRateLimit, RATE_LIMITS } from "@/lib/utils/rate-limit";
import { eq } from "drizzle-orm";

/**
 * Extract machine token from Authorization header or request body.
 * Prefers the Authorization header (MEDIUM-3).
 */
function extractMachineToken(request: NextRequest, bodyToken?: string): string | null {
  // Check Authorization: Bearer <token> header first
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token.length > 0) return token;
  }

  // Fall back to body token for backward compatibility
  return bodyToken ?? null;
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body, handling gzip-compressed payloads from Go agents
    let body: unknown;
    const contentEncoding = request.headers.get("content-encoding");

    if (contentEncoding === "gzip") {
      try {
        const buffer = Buffer.from(await request.arrayBuffer());
        const decompressed = gunzipSync(buffer);
        body = JSON.parse(decompressed.toString("utf-8"));
      } catch {
        return errorResponse("Invalid gzip payload", 400);
      }
    } else {
      body = await request.json();
    }

    // Validate with metricBatchSchema (machine_token is now optional in body)
    const parsed = metricBatchSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Invalid payload", 422);
    }

    const { machine_token: bodyToken, metrics: metricBatch } = parsed.data;

    // Extract token from header or body (MEDIUM-3)
    const machineToken = extractMachineToken(request, bodyToken);
    if (!machineToken) {
      return errorResponse("Machine token is required", 401);
    }

    // Look up machine by token
    const db = getDb();
    const [machine] = await db.select({ id: machines.id }).from(machines).where(eq(machines.machineToken, machineToken)).limit(1);

    if (!machine) {
      return errorResponse("Invalid machine token", 401);
    }

    // Rate limit by machine ID
    const rateCheck = checkRateLimit(`ingest:${machine.id}`, RATE_LIMITS.ingest);
    if (!rateCheck.allowed) {
      return errorResponse("Rate limit exceeded", 429);
    }

    // Prepare metric values for bulk insert
    const metricValues = metricBatch.map((m) => ({
      machineId: machine.id,
      timestamp: new Date(m.timestamp),
      cpuOverall: m.cpu_overall,
      cpuCores: m.cpu_cores,
      ramUsed: m.ram_used,
      ramTotal: m.ram_total,
      diskUsage: m.disk_usage,
      networkRx: m.network_rx,
      networkTx: m.network_tx,
      uptimeSeconds: m.uptime_seconds,
      cpuTemp: m.cpu_temp ?? null,
      gpuTemp: m.gpu_temp ?? null,
    }));

    // Bulk insert metrics, returning IDs
    const insertedMetrics = await db.insert(metrics).values(metricValues).returning({ id: metrics.id });

    // Prepare process snapshot values for bulk insert
    const processValues: { metricId: string; processes: unknown }[] = [];
    for (let i = 0; i < metricBatch.length; i++) {
      const m = metricBatch[i];
      if (m.processes && m.processes.length > 0) {
        processValues.push({
          metricId: insertedMetrics[i].id,
          processes: m.processes,
        });
      }
    }

    // Bulk insert process snapshots if any exist
    if (processValues.length > 0) {
      await db.insert(processSnapshots).values(processValues);
    }

    // Update machine's last_seen timestamp
    await db.update(machines).set({ lastSeen: new Date() }).where(eq(machines.id, machine.id));

    return successResponse({ inserted: insertedMetrics.length }, 201);
  } catch (error) {
    console.error("Ingest error:", error);
    return errorResponse("Internal server error", 500);
  }
}
