"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertManagerEmployeeAccess } from "@/lib/queries/employees";

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
  remarks: string;
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

    const canEditTargets = role === "super_admin" || role === "manager";

    // If manager, verify access to all employee IDs
    if (role === "manager") {
      const empIds = entries.map((e) => e.employee_id);
      const hasAccess = await assertManagerEmployeeAccess(
        supabase,
        user.id,
        empIds
      );
      if (!hasAccess) {
        return { error: "You don't have access to one or more employees" };
      }
    }

    // Build upsert rows based on role
    const rows = entries.map((e) => {
      const remarks = e.remarks.trim() || null;
      if (canEditTargets) {
        // Super admin and manager can set both targets and actuals
        return {
          employee_id: e.employee_id,
          date,
          target_calls: e.target_calls,
          target_total_meetings: e.target_total_meetings,
          actual_calls: e.actual_calls,
          actual_architect_meetings: e.actual_architect_meetings,
          actual_client_meetings: e.actual_client_meetings,
          actual_site_visits: e.actual_site_visits,
          remarks,
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
        remarks,
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
  /* Multi-month: each entry is 1..12, all within the same `year`. The dialog
   * holds a Set client-side and serialises a sorted array on submit; the
   * server treats the array as the source of truth and validates membership
   * here so a malformed payload from somewhere else can't poison the loop. */
  months: number[];
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
    months,
    year,
    target_calls,
    target_total_meetings,
    included_weekdays,
  } = input;

  if (!Array.isArray(months) || months.length === 0) {
    return { error: "Select at least one month" };
  }
  if (months.some((m) => !Number.isInteger(m) || m < 1 || m > 12)) {
    return { error: "Invalid month value" };
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

    if (role !== "super_admin" && role !== "manager") {
      return { error: "Only super admins and managers can set bulk targets" };
    }

    // Resolve employee IDs
    let employeeIds: string[];
    if (employee_ids && employee_ids.length > 0) {
      employeeIds = employee_ids;
    } else {
      // "All employees" — for manager, scoped to their assignments
      if (role === "manager") {
        const { data: assignments } = await supabase
          .from("manager_assignments")
          .select("employee_id")
          .eq("manager_id", user.id);
        employeeIds = (assignments ?? []).map((a) => a.employee_id);
      } else {
        const { data: employees, error: empError } = await supabase
          .from("employees")
          .select("id")
          .eq("is_active", true);
        if (empError) return { error: empError.message };
        employeeIds = (employees ?? []).map((e) => e.id);
      }
    }

    if (employeeIds.length === 0) {
      return { error: "No employees found" };
    }

    // If manager with explicit IDs, verify access
    if (role === "manager" && employee_ids && employee_ids.length > 0) {
      const hasAccess = await assertManagerEmployeeAccess(
        supabase,
        user.id,
        employeeIds
      );
      if (!hasAccess) {
        return { error: "You don't have access to one or more employees" };
      }
    }

    /* Generate working dates across every selected month. Months are
     * independent — same employee, same target value, same weekday filter,
     * just different date stamps — so we flatten into a single ordered list
     * and let the daily_metrics upsert handle them in one logical pass.
     * `included_weekdays` applies uniformly across months by design (the
     * "Working Days" toggle is a property of the policy, not the month). */
    const includedSet = new Set(included_weekdays);
    const allDates: string[] = [];

    for (const month of months) {
      const daysInMonth = new Date(year, month, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month - 1, d);
        if (includedSet.has(date.getDay())) {
          const yyyy = date.getFullYear();
          const mm = String(date.getMonth() + 1).padStart(2, "0");
          const dd = String(date.getDate()).padStart(2, "0");
          allDates.push(`${yyyy}-${mm}-${dd}`);
        }
      }
    }

    if (allDates.length === 0) {
      return { error: "No working days selected" };
    }

    /* Persist the *designated plan* on monthly_targets before writing daily
     * rows — this is what the MTD calculator falls back to when an elapsed
     * working day has no daily_metrics row. Without it, a sparsely-logged
     * month silently under-counts the cumulative target.
     *
     * One plan row per (employee × month). target_total_calls /
     * target_total_meetings are rollup outputs owned by the
     * _sync_monthly_from_daily trigger, so we deliberately omit them and let
     * the trigger rewrite them once the daily_metrics upsert below fires.
     * Existing rollup values on pre-existing rows are preserved.
     *
     * 100 employees × 12 months = 1,200 plan rows worst case, well past
     * comfortable-payload territory for one PostgREST request — same batch
     * loop as the daily upsert below. */
    const planRows = employeeIds.flatMap((empId) =>
      months.map((month) => ({
        employee_id: empId,
        month,
        year,
        daily_target_calls: target_calls,
        daily_target_total_meetings: target_total_meetings,
        working_weekdays: included_weekdays,
      })),
    );

    const BATCH_SIZE = 500;

    for (let i = 0; i < planRows.length; i += BATCH_SIZE) {
      const batch = planRows.slice(i, i + BATCH_SIZE);
      const { error: planError } = await supabase
        .from("monthly_targets")
        .upsert(batch, { onConflict: "employee_id,month,year" });
      if (planError) return { error: planError.message };
    }

    // Build daily upsert rows (only target columns — existing actuals are
    // preserved). Cross-product of employees × every working date across
    // every selected month.
    const rows = employeeIds.flatMap((empId) =>
      allDates.map((date) => ({
        employee_id: empId,
        date,
        target_calls,
        target_total_meetings,
      })),
    );

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("daily_metrics")
        .upsert(batch, { onConflict: "employee_id,date" });
      if (error) return { error: error.message };
    }

    revalidatePath("/daily-logs");
    revalidatePath("/monthly-data");
    revalidatePath("/cumulative-data");
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
