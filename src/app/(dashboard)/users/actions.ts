"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { success: true } | { error: string };

async function assertSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "super_admin") throw new Error("Forbidden");

  return { supabase, currentUserId: user.id };
}

export async function toggleUserStatus(
  userId: string,
  currentStatus: boolean
): Promise<ActionResult> {
  try {
    const { supabase, currentUserId } = await assertSuperAdmin();

    if (userId === currentUserId) {
      return { error: "You cannot deactivate your own account" };
    }

    const { error } = await supabase
      .from("profiles")
      .update({ is_active: !currentStatus })
      .eq("id", userId);

    if (error) return { error: error.message };

    revalidatePath("/users");
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/* ── Manager Assignment CRUD ── */

export async function getManagerAssignments(
  managerId: string
): Promise<string[]> {
  try {
    const { supabase } = await assertSuperAdmin();

    const { data } = await supabase
      .from("manager_assignments")
      .select("employee_id")
      .eq("manager_id", managerId);

    return (data ?? []).map((a) => a.employee_id);
  } catch {
    return [];
  }
}

export async function saveManagerAssignments(
  managerId: string,
  employeeIds: string[]
): Promise<ActionResult> {
  try {
    const { supabase } = await assertSuperAdmin();

    // Verify the target user is actually a Custom Admin. Super Admins assign
    // to Custom Admins only — never to themselves, viewers, or editors.
    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", managerId)
      .single();

    if (targetProfile?.role !== "custom_admin") {
      return { error: "User is not a custom admin" };
    }

    /* ── Two-delete backstop ──────────────────────────────────────────────
     *
     * Migration 0017 added UNIQUE(employee_id) on manager_assignments: each
     * employee can be claimed by at most one Custom Admin. The PRIMARY
     * guardrail against silent reassignment now lives in the UI — the
     * ManagerAssignmentDialog disables (with a "Assigned to {name}" hint)
     * every employee already owned by a peer admin, so the happy-path
     * payload should never reference one. The two deletes below remain as
     * a defence-in-depth backstop for three other cases:
     *
     *   (1) THIS manager's existing roster. Preserves the "replace"
     *       semantic so the action stays idempotent and the Super Admin's
     *       intent ("these are now their employees, nothing else") wins
     *       over whatever was there before.
     *
     *   (2) Stale clients / direct-API callers. If something bypasses the
     *       disabled UI and submits an employee owned by a peer, the
     *       second delete is what saves the insert from a 23505. The
     *       resulting transfer is silent — that's intentional: there's no
     *       legitimate UI path that gets here, so a generic backstop is
     *       fine.
     *
     *   (3) Concurrent edits between Super Admins. Rare but real.
     *
     * Two separate DELETE statements (rather than one OR'd predicate) keep
     * each error attributable to its cause and read top-to-bottom.
     * ───────────────────────────────────────────────────────────────────── */

    const { error: clearRosterError } = await supabase
      .from("manager_assignments")
      .delete()
      .eq("manager_id", managerId);
    if (clearRosterError) return { error: clearRosterError.message };

    if (employeeIds.length > 0) {
      const { error: transferError } = await supabase
        .from("manager_assignments")
        .delete()
        .in("employee_id", employeeIds);
      if (transferError) return { error: transferError.message };

      const rows = employeeIds.map((empId) => ({
        manager_id: managerId,
        employee_id: empId,
      }));

      const { error: insertError } = await supabase
        .from("manager_assignments")
        .insert(rows);

      if (insertError) {
        if (insertError.code === "23505") {
          return {
            error:
              "One of these employees was just assigned by another super admin. Please refresh and try again.",
          };
        }
        return { error: insertError.message };
      }
    }

    revalidatePath("/users");
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
