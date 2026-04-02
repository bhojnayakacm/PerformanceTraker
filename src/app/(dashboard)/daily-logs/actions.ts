"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { success: true } | { error: string };

/* ── Save Daily Metrics (per-day grid) ── */

type DailyEntry = {
  employee_id: string;
  target_calls: number;
  target_total_meetings: number;
  actual_calls: number;
  actual_architect_meetings: number;
  actual_client_meetings: number;
  actual_site_visits: number;
};

type SaveInput = {
  date: string;
  entries: DailyEntry[];
};

export async function saveDailyMetrics(
  input: SaveInput
): Promise<ActionResult> {
  const { date, entries } = input;

  if (!date || entries.length === 0) {
    return { error: "No data to save" };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = profile?.role ?? "viewer";

    if (role === "viewer") {
      return { error: "You don't have permission to edit data" };
    }

    const isSuperAdmin = role === "super_admin";

    // Build upsert rows based on role
    const rows = entries.map((e) => {
      if (isSuperAdmin) {
        // Super admin can set both targets and actuals
        return {
          employee_id: e.employee_id,
          date,
          target_calls: e.target_calls,
          target_total_meetings: e.target_total_meetings,
          actual_calls: e.actual_calls,
          actual_architect_meetings: e.actual_architect_meetings,
          actual_client_meetings: e.actual_client_meetings,
          actual_site_visits: e.actual_site_visits,
        };
      }
      // Editor can only set actuals
      return {
        employee_id: e.employee_id,
        date,
        actual_calls: e.actual_calls,
        actual_architect_meetings: e.actual_architect_meetings,
        actual_client_meetings: e.actual_client_meetings,
        actual_site_visits: e.actual_site_visits,
      };
    });

    const { error } = await supabase
      .from("daily_metrics")
      .upsert(rows, { onConflict: "employee_id,date" });

    if (error) return { error: error.message };

    revalidatePath("/daily-logs");
    revalidatePath("/monthly-data");
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/* ── Bulk Set Monthly Targets ── */

type BulkSetInput = {
  employee_ids: string[] | null; // null = all active employees
  month: number;
  year: number;
  target_calls: number;
  target_total_meetings: number;
  included_weekdays: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
};

export async function bulkSetMonthlyTargets(
  input: BulkSetInput
): Promise<ActionResult> {
  const {
    employee_ids,
    month,
    year,
    target_calls,
    target_total_meetings,
    included_weekdays,
  } = input;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "super_admin") {
      return { error: "Only super admins can set bulk targets" };
    }

    // Resolve employee IDs
    let employeeIds: string[];
    if (employee_ids && employee_ids.length > 0) {
      employeeIds = employee_ids;
    } else {
      const { data: employees, error: empError } = await supabase
        .from("employees")
        .select("id")
        .eq("is_active", true);
      if (empError) return { error: empError.message };
      employeeIds = (employees ?? []).map((e) => e.id);
    }

    if (employeeIds.length === 0) {
      return { error: "No employees found" };
    }

    // Generate working dates for the month
    const includedSet = new Set(included_weekdays);
    const daysInMonth = new Date(year, month, 0).getDate();
    const dates: string[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d);
      if (includedSet.has(date.getDay())) {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        dates.push(`${yyyy}-${mm}-${dd}`);
      }
    }

    if (dates.length === 0) {
      return { error: "No working days selected" };
    }

    // Build upsert rows (only target columns — existing actuals are preserved)
    const rows = employeeIds.flatMap((empId) =>
      dates.map((date) => ({
        employee_id: empId,
        date,
        target_calls,
        target_total_meetings,
      }))
    );

    // Upsert in batches to avoid payload size limits
    const BATCH_SIZE = 500;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("daily_metrics")
        .upsert(batch, { onConflict: "employee_id,date" });
      if (error) return { error: error.message };
    }

    revalidatePath("/daily-logs");
    revalidatePath("/monthly-data");
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
