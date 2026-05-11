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

    // Verify target user is actually a manager
    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", managerId)
      .single();

    if (targetProfile?.role !== "custom_admin") {
      return { error: "User is not a custom admin" };
    }

    // Delete existing assignments
    const { error: deleteError } = await supabase
      .from("manager_assignments")
      .delete()
      .eq("manager_id", managerId);

    if (deleteError) return { error: deleteError.message };

    // Insert new assignments
    if (employeeIds.length > 0) {
      const rows = employeeIds.map((empId) => ({
        manager_id: managerId,
        employee_id: empId,
      }));

      const { error: insertError } = await supabase
        .from("manager_assignments")
        .insert(rows);

      if (insertError) return { error: insertError.message };
    }

    revalidatePath("/users");
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
