// GET /api/machines/[id] — get a specific machine's details
// PUT /api/machines/[id] — update machine settings
// DELETE /api/machines/[id] — delete a machine and its data

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { machines, machineAccess } from "@/lib/db/schema";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { updateMachineSchema } from "@/lib/validation/machines";
import { successResponse, errorResponse, validationErrorResponse } from "@/lib/utils/response";
import { eq, and } from "drizzle-orm";

/**
 * Check if a user has access to a machine (owner or shared via machine_access).
 * Returns the machine record if access is granted, null otherwise.
 */
async function checkMachineAccess(machineId: string, userId: string) {
  const db = getDb();

  const [machine] = await db.select().from(machines).where(eq(machines.id, machineId)).limit(1);

  if (!machine) return null;

  // Owner always has access
  if (machine.userId === userId) return machine;

  // Check shared access
  const [access] = await db
    .select()
    .from(machineAccess)
    .where(and(eq(machineAccess.machineId, machineId), eq(machineAccess.userId, userId)))
    .limit(1);

  if (access) return machine;

  return null;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withAuth(async (_req: NextRequest, { user }: AuthContext): Promise<NextResponse> => {
    try {
      const { id: machineId } = await context.params;

      const machine = await checkMachineAccess(machineId, user.sub);
      if (!machine) {
        return errorResponse("Machine not found", 404);
      }

      // Strip machineToken from response — only shown once at creation (HIGH-2)
      const { machineToken, ...machineData } = machine;
      return successResponse({ machine: machineData });
    } catch (error) {
      console.error("Get machine error:", error);
      return errorResponse("Internal server error", 500);
    }
  })(request);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withAuth(async (_req: NextRequest, { user }: AuthContext): Promise<NextResponse> => {
    try {
      const { id: machineId } = await context.params;
      const db = getDb();

      // Only owner can update
      const [machine] = await db.select().from(machines).where(eq(machines.id, machineId)).limit(1);

      if (!machine) {
        return errorResponse("Machine not found", 404);
      }

      if (machine.userId !== user.sub) {
        return errorResponse("Only the owner can update this machine", 403);
      }

      // Validate input
      const body = await _req.json();
      const parsed = updateMachineSchema.safeParse(body);
      if (!parsed.success) {
        const fieldErrors: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
          const field = issue.path.join(".");
          if (!fieldErrors[field]) fieldErrors[field] = [];
          fieldErrors[field].push(issue.message);
        }
        return validationErrorResponse(fieldErrors);
      }

      const updates = parsed.data;

      // Build update object (only include provided fields)
      const updateData: Record<string, unknown> = {};
      if (updates.name !== undefined) updateData.name = updates.name;

      if (Object.keys(updateData).length === 0) {
        return errorResponse("No fields to update", 400);
      }

      const [updated] = await db.update(machines).set(updateData).where(eq(machines.id, machineId)).returning();

      // Strip machineToken from response (HIGH-2)
      const { machineToken: _token, ...updatedData } = updated;
      return successResponse({ machine: updatedData });
    } catch (error) {
      console.error("Update machine error:", error);
      return errorResponse("Internal server error", 500);
    }
  })(request);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withAuth(async (_req: NextRequest, { user }: AuthContext): Promise<NextResponse> => {
    try {
      const { id: machineId } = await context.params;
      const db = getDb();

      // Only owner can delete
      const [machine] = await db.select().from(machines).where(eq(machines.id, machineId)).limit(1);

      if (!machine) {
        return errorResponse("Machine not found", 404);
      }

      if (machine.userId !== user.sub) {
        return errorResponse("Only the owner can delete this machine", 403);
      }

      // Delete machine (cascades to metrics, process_snapshots, machine_access)
      await db.delete(machines).where(eq(machines.id, machineId));

      return successResponse({ deleted: true });
    } catch (error) {
      console.error("Delete machine error:", error);
      return errorResponse("Internal server error", 500);
    }
  })(request);
}
