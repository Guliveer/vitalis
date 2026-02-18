// GET /api/machines/[id]/metrics — query time-series metrics for a specific machine

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { metrics, metricsHourly, metricsDaily, processSnapshots, machines, machineAccess } from "@/lib/db/schema";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { metricQuerySchema } from "@/lib/validation/machines";
import { successResponse, errorResponse } from "@/lib/utils/response";
import { eq, and, gte, lte, desc } from "drizzle-orm";

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

      // Check ownership or shared access
      const hasAccess =
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

          // Optionally include process snapshots
          let processData: Record<string, unknown> = {};
          if (includeProcesses && rawMetrics.length > 0) {
            const metricIds = rawMetrics.map((m) => m.id);
            const snapshots = await db
              .select()
              .from(processSnapshots)
              .where(
                metricIds.length === 1
                  ? eq(processSnapshots.metricId, metricIds[0])
                  : // For multiple IDs, query each and merge
                    eq(processSnapshots.metricId, metricIds[0]),
              );

            // For efficiency with multiple IDs, query all at once
            let allSnapshots = snapshots;
            if (metricIds.length > 1) {
              const snapshotResults = await Promise.all(metricIds.map((id) => db.select().from(processSnapshots).where(eq(processSnapshots.metricId, id))));
              allSnapshots = snapshotResults.flat();
            }

            for (const snap of allSnapshots) {
              processData[snap.metricId] = snap.processes;
            }
          }

          const result = rawMetrics.map((m) => ({
            ...m,
            processes: includeProcesses ? (processData[m.id] ?? null) : undefined,
          }));

          return successResponse({ metrics: result, resolution: "raw", count: result.length });
        }

        case "hourly": {
          const hourlyMetrics = await db
            .select()
            .from(metricsHourly)
            .where(and(eq(metricsHourly.machineId, machineId), gte(metricsHourly.hour, fromDate), lte(metricsHourly.hour, toDate)))
            .orderBy(desc(metricsHourly.hour))
            .limit(MAX_HOURLY);

          return successResponse({ metrics: hourlyMetrics, resolution: "hourly", count: hourlyMetrics.length });
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

          return successResponse({ metrics: dailyMetrics, resolution: "daily", count: dailyMetrics.length });
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
