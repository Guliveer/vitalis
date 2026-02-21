// GET /api/machines — list all machines for the authenticated user (owned + shared)
// POST /api/machines — register a new machine

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { machines, machineAccess, metrics } from "@/lib/db/schema";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { createMachineSchema } from "@/lib/validation/machines";
import { successResponse, errorResponse, validationErrorResponse } from "@/lib/utils/response";
import { eq, desc, or, sql, type InferSelectModel } from "drizzle-orm";
import crypto from "crypto";

// Two-minute threshold for online status
const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;

export const GET = withAuth(async (request: NextRequest, { user }: AuthContext): Promise<NextResponse> => {
  try {
    const db = getDb();

    let allMachines: InferSelectModel<typeof machines>[];

    if (user.role === "ADMIN") {
      // Admin bypass: fetch all machines without ownership/shared filtering
      allMachines = await db.select().from(machines);
    } else {
      // Get machines owned by user
      const ownedMachines = await db.select().from(machines).where(eq(machines.userId, user.sub));

      // Get machines shared with user via machine_access
      const sharedAccess = await db.select({ machineId: machineAccess.machineId }).from(machineAccess).where(eq(machineAccess.userId, user.sub));

      const sharedMachineIds = sharedAccess.map((a) => a.machineId);

      let sharedMachines: (typeof ownedMachines)[number][] = [];
      if (sharedMachineIds.length > 0) {
        sharedMachines = await db
          .select()
          .from(machines)
          .where(or(...sharedMachineIds.map((id) => eq(machines.id, id))));
      }

      // Combine and deduplicate
      const allMachinesMap = new Map<string, (typeof ownedMachines)[number]>();
      for (const m of [...ownedMachines, ...sharedMachines]) {
        allMachinesMap.set(m.id, m);
      }

      allMachines = Array.from(allMachinesMap.values());
    }

    const now = Date.now();

    // Enrich with online status and latest metric summary
    const enriched = await Promise.all(
      allMachines.map(async (machine) => {
        const isOnline = machine.lastSeen ? now - new Date(machine.lastSeen).getTime() < ONLINE_THRESHOLD_MS : false;

        // Get latest metric for summary
        const [latestMetric] = await db
          .select({
            cpuOverall: metrics.cpuOverall,
            ramUsed: metrics.ramUsed,
            ramTotal: metrics.ramTotal,
            networkRx: metrics.networkRx,
            networkTx: metrics.networkTx,
            diskUsage: metrics.diskUsage,
            uptimeSeconds: metrics.uptimeSeconds,
            cpuTemp: metrics.cpuTemp,
            gpuTemp: metrics.gpuTemp,
          })
          .from(metrics)
          .where(eq(metrics.machineId, machine.id))
          .orderBy(desc(metrics.timestamp))
          .limit(1);

        return {
          id: machine.id,
          userId: machine.userId,
          name: machine.name,
          os: machine.os,
          osVersion: machine.osVersion,
          osName: machine.osName,
          arch: machine.arch,
          lastSeen: machine.lastSeen,
          createdAt: machine.createdAt,
          isOnline,
          lastMetric: latestMetric
            ? {
                cpuOverall: latestMetric.cpuOverall,
                ramUsed: latestMetric.ramUsed,
                ramTotal: latestMetric.ramTotal,
                networkRx: latestMetric.networkRx ?? null,
                networkTx: latestMetric.networkTx ?? null,
                diskUsage: latestMetric.diskUsage ?? null,
                uptimeSeconds: latestMetric.uptimeSeconds ?? null,
                cpuTemp: latestMetric.cpuTemp ?? null,
                gpuTemp: latestMetric.gpuTemp ?? null,
              }
            : undefined,
        };
      }),
    );

    return successResponse({ machines: enriched });
  } catch (error) {
    console.error("List machines error:", error);
    return errorResponse("Internal server error", 500);
  }
});

export const POST = withAuth(async (request: NextRequest, { user }: AuthContext): Promise<NextResponse> => {
  try {
    const body = await request.json();

    // Validate input
    const parsed = createMachineSchema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path.join(".");
        if (!fieldErrors[field]) fieldErrors[field] = [];
        fieldErrors[field].push(issue.message);
      }
      return validationErrorResponse(fieldErrors);
    }

    const { name, os, arch } = parsed.data;

    // Generate unique machine token
    const machineToken = `mtoken_${crypto.randomUUID()}`;

    const db = getDb();
    const [created] = await db
      .insert(machines)
      .values({
        userId: user.sub,
        name,
        machineToken,
        os: os ?? null,
        arch: arch ?? null,
      })
      .returning();

    return successResponse(
      {
        machine: {
          id: created.id,
          userId: created.userId,
          name: created.name,
          machineToken: created.machineToken,
          os: created.os,
          arch: created.arch,
          lastSeen: created.lastSeen,
          createdAt: created.createdAt,
        },
      },
      201,
    );
  } catch (error) {
    console.error("Create machine error:", error);
    return errorResponse("Internal server error", 500);
  }
});
