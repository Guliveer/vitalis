// GET /api/machines/[id]/metrics — query time-series metrics for a specific machine

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { metrics, metricsHourly, metricsDaily, processSnapshots, machines, machineAccess } from "@/lib/db/schema";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { metricQuerySchema } from "@/lib/validation/machines";
import { successResponse, errorResponse } from "@/lib/utils/response";
import { eq, and, gte, lte, desc, inArray } from "drizzle-orm";

// Maximum results per resolution
const MAX_RAW = 1000;
const MAX_HOURLY = 720;
const MAX_DAILY = 365;

// Maximum raw query range: 24 hours
const MAX_RAW_RANGE_MS = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withAuth(async (_req: NextRequest, { user }: AuthContext): Promise<NextResponse> => {
    try {
      const { id: machineId } = await context.params;
      const db = getDb();

      // Check machine exists
      const [machine] = await db.select().from(machines).where(eq(machines.id, machineId)).limit(1);

      if (!machine) {
        return errorResponse("Machine not found", 404);
      }

      // Check admin, ownership, or shared access
      const hasAccess =
        user.role === "ADMIN" ||
        machine.userId === user.sub ||
        (
          await db
            .select()
            .from(machineAccess)
            .where(and(eq(machineAccess.machineId, machineId), eq(machineAccess.userId, user.sub)))
            .limit(1)
        ).length > 0;

      if (!hasAccess) {
        return errorResponse("Access denied", 403);
      }

      // Parse and validate query params
      const url = new URL(_req.url);
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const resolution = url.searchParams.get("resolution") || "raw";
      const includeProcesses = url.searchParams.get("include_processes") === "true";

      const parsed = metricQuerySchema.safeParse({ from, to, resolution });
      if (!parsed.success) {
        return errorResponse("Invalid query parameters: from, to (ISO datetime) and resolution (raw|hourly|daily) are required", 400);
      }

      const fromDate = new Date(parsed.data.from);
      const toDate = new Date(parsed.data.to);

      if (fromDate >= toDate) {
        return errorResponse("'from' must be before 'to'", 400);
      }

      // Helper: fetch the latest process snapshot for a given machine within a time range.
      // Returns the processes array from the most recent metric's snapshot, or null if none found.
      async function fetchLatestProcessSnapshot(db: ReturnType<typeof getDb>, machineId: string, fromDate: Date, toDate: Date): Promise<unknown[] | null> {
        // Find the most recent raw metric for this machine in the time range
        const [latestMetric] = await db
          .select({ id: metrics.id })
          .from(metrics)
          .where(and(eq(metrics.machineId, machineId), gte(metrics.timestamp, fromDate), lte(metrics.timestamp, toDate)))
          .orderBy(desc(metrics.timestamp))
          .limit(1);

        if (!latestMetric) return null;

        // Fetch the process snapshot for that metric
        const [snapshot] = await db.select().from(processSnapshots).where(eq(processSnapshots.metricId, latestMetric.id)).limit(1);

        return snapshot ? (snapshot.processes as unknown[]) : null;
      }

      // Query based on resolution
      switch (parsed.data.resolution) {
        case "raw": {
          // Enforce max 24h range for raw queries
          if (toDate.getTime() - fromDate.getTime() > MAX_RAW_RANGE_MS) {
            return errorResponse("Raw resolution limited to 24-hour range", 400);
          }

          const rawMetrics = await db
            .select()
            .from(metrics)
            .where(and(eq(metrics.machineId, machineId), gte(metrics.timestamp, fromDate), lte(metrics.timestamp, toDate)))
            .orderBy(desc(metrics.timestamp))
            .limit(MAX_RAW);

          // Optionally include the latest process snapshot (single query, no N+1)
          let processes: unknown[] | null = null;
          if (includeProcesses && rawMetrics.length > 0) {
            // Metrics are ordered DESC, so the first entry is the most recent
            const latestMetricId = rawMetrics[0].id;
            const [snapshot] = await db.select().from(processSnapshots).where(eq(processSnapshots.metricId, latestMetricId)).limit(1);

            processes = snapshot ? (snapshot.processes as unknown[]) : null;
          }

          return successResponse({
            metrics: rawMetrics,
            processes: includeProcesses ? (processes ?? []) : undefined,
            resolution: "raw",
            count: rawMetrics.length,
          });
        }

        case "hourly": {
          const hourlyMetrics = await db
            .select()
            .from(metricsHourly)
            .where(and(eq(metricsHourly.machineId, machineId), gte(metricsHourly.hour, fromDate), lte(metricsHourly.hour, toDate)))
            .orderBy(desc(metricsHourly.hour))
            .limit(MAX_HOURLY);

          // Fetch latest process snapshot if requested
          let processes: unknown[] | null = null;
          if (includeProcesses) {
            processes = await fetchLatestProcessSnapshot(db, machineId, fromDate, toDate);
          }

          return successResponse({
            metrics: hourlyMetrics,
            processes: includeProcesses ? (processes ?? []) : undefined,
            resolution: "hourly",
            count: hourlyMetrics.length,
          });
        }

        case "daily": {
          // metricsDaily.day is a date column (string format YYYY-MM-DD)
          const fromDay = fromDate.toISOString().split("T")[0];
          const toDay = toDate.toISOString().split("T")[0];

          const dailyMetrics = await db
            .select()
            .from(metricsDaily)
            .where(and(eq(metricsDaily.machineId, machineId), gte(metricsDaily.day, fromDay), lte(metricsDaily.day, toDay)))
            .orderBy(desc(metricsDaily.day))
            .limit(MAX_DAILY);

          // Fetch latest process snapshot if requested
          let processes: unknown[] | null = null;
          if (includeProcesses) {
            processes = await fetchLatestProcessSnapshot(db, machineId, fromDate, toDate);
          }

          return successResponse({
            metrics: dailyMetrics,
            processes: includeProcesses ? (processes ?? []) : undefined,
            resolution: "daily",
            count: dailyMetrics.length,
          });
        }

        default:
          return errorResponse("Invalid resolution", 400);
      }
    } catch (error) {
      console.error("Metrics query error:", error);
      return errorResponse("Internal server error", 500);
    }
  })(request);
}
