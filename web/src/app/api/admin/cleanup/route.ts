// POST /api/admin/cleanup — data retention cleanup and aggregation job
// Triggered by Vercel Cron (daily at 3:00 AM UTC) or manually by admin

import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { successResponse, errorResponse } from "@/lib/utils/response";

/**
 * Verify the request is authorized — either via CRON_SECRET or admin JWT.
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 */
function verifyCronAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * Shared cleanup logic used by both GET (Vercel Cron) and POST (manual trigger).
 */
async function handleCleanup(request: NextRequest) {
  try {
    // Verify cron authorization
    if (!verifyCronAuth(request)) {
      return errorResponse("Unauthorized", 401);
    }

    const sql = neon(process.env.DATABASE_URL!);
    const summary: Record<string, unknown> = {};

    // Step 1: Aggregate raw metrics older than 24 hours into metrics_hourly
    // Only aggregate data that hasn't been aggregated yet (up to 8 days old)
    const hourlyResult = await sql`
      INSERT INTO metrics_hourly (id, machine_id, hour, cpu_avg, cpu_max, ram_avg, ram_max, network_rx_total, network_tx_total, sample_count)
      SELECT
        gen_random_uuid(),
        machine_id,
        date_trunc('hour', timestamp) AS hour,
        AVG(cpu_overall)::real AS cpu_avg,
        MAX(cpu_overall)::real AS cpu_max,
        AVG(ram_used)::bigint AS ram_avg,
        MAX(ram_used)::bigint AS ram_max,
        SUM(network_rx)::bigint AS network_rx_total,
        SUM(network_tx)::bigint AS network_tx_total,
        COUNT(*)::integer AS sample_count
      FROM metrics
      WHERE timestamp < NOW() - INTERVAL '24 hours'
        AND timestamp >= NOW() - INTERVAL '8 days'
      GROUP BY machine_id, date_trunc('hour', timestamp)
      ON CONFLICT (machine_id, hour) DO UPDATE SET
        cpu_avg = EXCLUDED.cpu_avg,
        cpu_max = EXCLUDED.cpu_max,
        ram_avg = EXCLUDED.ram_avg,
        ram_max = EXCLUDED.ram_max,
        network_rx_total = EXCLUDED.network_rx_total,
        network_tx_total = EXCLUDED.network_tx_total,
        sample_count = EXCLUDED.sample_count
    `;
    summary.hourlyAggregated = hourlyResult.length ?? 0;

    // Step 2: Aggregate hourly metrics older than 7 days into metrics_daily
    const dailyResult = await sql`
      INSERT INTO metrics_daily (id, machine_id, day, cpu_avg, cpu_max, ram_avg, ram_max, network_rx_total, network_tx_total, sample_count)
      SELECT
        gen_random_uuid(),
        machine_id,
        date_trunc('day', hour)::date AS day,
        AVG(cpu_avg)::real AS cpu_avg,
        MAX(cpu_max)::real AS cpu_max,
        AVG(ram_avg)::bigint AS ram_avg,
        MAX(ram_max)::bigint AS ram_max,
        SUM(network_rx_total)::bigint AS network_rx_total,
        SUM(network_tx_total)::bigint AS network_tx_total,
        SUM(sample_count)::integer AS sample_count
      FROM metrics_hourly
      WHERE hour < NOW() - INTERVAL '7 days'
        AND hour >= NOW() - INTERVAL '365 days'
      GROUP BY machine_id, date_trunc('day', hour)::date
      ON CONFLICT (machine_id, day) DO UPDATE SET
        cpu_avg = EXCLUDED.cpu_avg,
        cpu_max = EXCLUDED.cpu_max,
        ram_avg = EXCLUDED.ram_avg,
        ram_max = EXCLUDED.ram_max,
        network_rx_total = EXCLUDED.network_rx_total,
        network_tx_total = EXCLUDED.network_tx_total,
        sample_count = EXCLUDED.sample_count
    `;
    summary.dailyAggregated = dailyResult.length ?? 0;

    // Step 3: Delete raw metrics older than 7 days
    const deletedRaw = await sql`
      DELETE FROM metrics WHERE timestamp < NOW() - INTERVAL '7 days'
    `;
    summary.rawMetricsDeleted = deletedRaw.length ?? 0;

    // Step 4: Delete orphaned process snapshots (safety net — cascade should handle this)
    const deletedSnapshots = await sql`
      DELETE FROM process_snapshots
      WHERE metric_id NOT IN (SELECT id FROM metrics)
    `;
    summary.orphanedSnapshotsDeleted = deletedSnapshots.length ?? 0;

    // Step 5: Delete hourly metrics older than 30 days
    const deletedHourly = await sql`
      DELETE FROM metrics_hourly WHERE hour < NOW() - INTERVAL '30 days'
    `;
    summary.hourlyMetricsDeleted = deletedHourly.length ?? 0;

    // Step 6: Delete daily metrics older than 1 year
    const deletedDaily = await sql`
      DELETE FROM metrics_daily WHERE day < (NOW() - INTERVAL '365 days')::date
    `;
    summary.dailyMetricsDeleted = deletedDaily.length ?? 0;

    return successResponse({ summary, completedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Cleanup error:", error);
    return errorResponse("Internal server error", 500);
  }
}

/**
 * GET handler — Vercel Cron sends GET requests (LOW-4).
 */
export async function GET(request: NextRequest) {
  return handleCleanup(request);
}

/**
 * POST handler — manual trigger by admin.
 */
export async function POST(request: NextRequest) {
  return handleCleanup(request);
}
