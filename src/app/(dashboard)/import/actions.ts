"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/types/database.types";

type ImportResult =
  | {
      imported: number;
      failed: number;
      errors: string[];
      notices?: string[];
    }
  | { error: string };

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

  if (profile?.role !== "super_admin")
    throw new Error("Forbidden: Super Admin access required");

  return supabase;
}

/* ─────────────────────────────────────────────────────────────
   Employees
───────────────────────────────────────────────────────────── */

export async function importEmployees(
  rows: { emp_id: string; name: string; location?: string; state?: string }[],
): Promise<ImportResult> {
  try {
    const supabase = await assertSuperAdmin();

    const upsertData = rows.map((row) => ({
      emp_id: row.emp_id,
      name: row.name,
      location: row.location || null,
      state: row.state || null,
    }));

    const { error } = await supabase
      .from("employees")
      .upsert(upsertData, { onConflict: "emp_id" });

    if (error) {
      return { imported: 0, failed: rows.length, errors: [error.message] };
    }

    revalidatePath("/employees");
    revalidatePath("/import");
    return { imported: rows.length, failed: 0, errors: [] };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/* ─────────────────────────────────────────────────────────────
   Helper — name → employee_id resolution
   (Exact case-sensitive match. The `employees_name_unique`
    constraint — migration 0011 — guarantees at most one hit
    per name.)
───────────────────────────────────────────────────────────── */

async function resolveEmployeesByName(
  supabase: Awaited<ReturnType<typeof assertSuperAdmin>>,
  names: string[],
) {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (unique.length === 0) return new Map<string, string>();

  const { data } = await supabase
    .from("employees")
    .select("id, name")
    .in("name", unique);

  return new Map(data?.map((e) => [e.name, e.id]) ?? []);
}

/* ─────────────────────────────────────────────────────────────
   Monthly Targets — STRIPPED of trigger-managed fields
   (no target_total_calls, no target_total_meetings,
    no target_travelling_cities)
───────────────────────────────────────────────────────────── */

export async function importTargets(
  rows: {
    name: string;
    month: number;
    year: number;
    target_client_visits: number;
    target_dispatched_sqft: number;
  }[],
): Promise<ImportResult> {
  try {
    const supabase = await assertSuperAdmin();
    const empMap = await resolveEmployeesByName(
      supabase,
      rows.map((r) => r.name),
    );

    const errors: string[] = [];
    const validRows: TablesInsert<"monthly_targets">[] = [];

    rows.forEach((row, idx) => {
      const key = row.name.trim();
      const employeeId = empMap.get(key);
      if (!employeeId) {
        errors.push(`Row ${idx + 1}: Employee "${row.name}" not found in system`);
        return;
      }

      validRows.push({
        employee_id: employeeId,
        month: row.month,
        year: row.year,
        target_client_visits: row.target_client_visits,
        target_dispatched_sqft: row.target_dispatched_sqft,
      });
    });

    if (validRows.length > 0) {
      const { error } = await supabase
        .from("monthly_targets")
        .upsert(validRows, { onConflict: "employee_id,month,year" });

      if (error) {
        return {
          imported: 0,
          failed: rows.length,
          errors: [...errors, error.message],
        };
      }
    }

    revalidatePath("/monthly-data");
    return { imported: validRows.length, failed: errors.length, errors };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/* ─────────────────────────────────────────────────────────────
   Monthly Actuals — STRIPPED of trigger-managed + GENERATED fields
   (no actual_calls, *_meetings, actual_site_visits — those come
    from daily_metrics. No actual_net_sale / actual_dispatched_sqft
    — those are GENERATED columns.)
───────────────────────────────────────────────────────────── */

export async function importActuals(
  rows: {
    name: string;
    month: number;
    year: number;
    actual_client_visits: number;
    actual_conversions: number;
    actual_project: number;
    actual_project_2: number;
    actual_tile: number;
    actual_retail: number;
    actual_return: number;
    salary: number;
    tada: number;
    incentive: number;
    sales_promotion: number;
    total_costing: number;
  }[],
): Promise<ImportResult> {
  try {
    const supabase = await assertSuperAdmin();
    const empMap = await resolveEmployeesByName(
      supabase,
      rows.map((r) => r.name),
    );

    const errors: string[] = [];
    const validRows: TablesInsert<"monthly_actuals">[] = [];

    rows.forEach((row, idx) => {
      const key = row.name.trim();
      const employeeId = empMap.get(key);
      if (!employeeId) {
        errors.push(`Row ${idx + 1}: Employee "${row.name}" not found in system`);
        return;
      }

      validRows.push({
        employee_id: employeeId,
        month: row.month,
        year: row.year,
        actual_client_visits: row.actual_client_visits,
        actual_conversions: row.actual_conversions,
        actual_project: row.actual_project,
        actual_project_2: row.actual_project_2,
        actual_tile: row.actual_tile,
        actual_retail: row.actual_retail,
        actual_return: row.actual_return,
        salary: row.salary,
        tada: row.tada,
        incentive: row.incentive,
        sales_promotion: row.sales_promotion,
        total_costing: row.total_costing,
      });
    });

    if (validRows.length > 0) {
      const { error } = await supabase
        .from("monthly_actuals")
        .upsert(validRows, { onConflict: "employee_id,month,year" });

      if (error) {
        return {
          imported: 0,
          failed: rows.length,
          errors: [...errors, error.message],
        };
      }
    }

    revalidatePath("/monthly-data");
    return { imported: validRows.length, failed: errors.length, errors };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/* ─────────────────────────────────────────────────────────────
   Daily Logs — feeds the daily_metrics table.
   The `trg_sync_daily_to_monthly` trigger automatically rolls these
   up into monthly_targets/monthly_actuals on every upsert, so users
   can explicitly skip non-working days by simply omitting them
   from the CSV.
───────────────────────────────────────────────────────────── */

export async function importDailyLogs(
  rows: {
    name: string;
    date: string;
    target_calls: number;
    target_total_meetings: number;
    actual_calls: number;
    actual_architect_meetings: number;
    actual_client_meetings: number;
    actual_site_visits: number;
    remarks?: string;
  }[],
): Promise<ImportResult> {
  try {
    const supabase = await assertSuperAdmin();
    const empMap = await resolveEmployeesByName(
      supabase,
      rows.map((r) => r.name),
    );

    const errors: string[] = [];
    const validRows: TablesInsert<"daily_metrics">[] = [];

    rows.forEach((row, idx) => {
      const key = row.name.trim();
      const employeeId = empMap.get(key);
      if (!employeeId) {
        errors.push(
          `Row ${idx + 1}: Employee "${row.name}" not found in system (date ${row.date} skipped)`,
        );
        return;
      }

      validRows.push({
        employee_id: employeeId,
        date: row.date,
        target_calls: row.target_calls,
        target_total_meetings: row.target_total_meetings,
        actual_calls: row.actual_calls,
        actual_architect_meetings: row.actual_architect_meetings,
        actual_client_meetings: row.actual_client_meetings,
        actual_site_visits: row.actual_site_visits,
        remarks: row.remarks?.trim() ? row.remarks.trim() : null,
      });
    });

    if (validRows.length > 0) {
      const { error } = await supabase
        .from("daily_metrics")
        .upsert(validRows, { onConflict: "employee_id,date" });

      if (error) {
        return {
          imported: 0,
          failed: rows.length,
          errors: [...errors, error.message],
        };
      }
    }

    revalidatePath("/monthly-data");
    revalidatePath("/daily-metrics");
    return { imported: validRows.length, failed: errors.length, errors };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/* ─────────────────────────────────────────────────────────────
   City Tours — relational per-city travel days.
   Resolves city_name → city_id with case-insensitive lookup.
   Missing cities are auto-created (title-cased) and surfaced
   to the operator as `notices` so nothing happens silently.
───────────────────────────────────────────────────────────── */

function titleCase(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export async function importCityTours(
  rows: {
    name: string;
    month: number;
    year: number;
    city_name: string;
    target_days: number;
    actual_days: number;
  }[],
): Promise<ImportResult> {
  try {
    const supabase = await assertSuperAdmin();
    const empMap = await resolveEmployeesByName(
      supabase,
      rows.map((r) => r.name),
    );

    // ── Resolve city_name → city_id (case-insensitive, auto-create) ──
    const requestedNames = [
      ...new Set(rows.map((r) => titleCase(r.city_name))),
    ];

    const { data: existingCities, error: citiesError } = await supabase
      .from("cities")
      .select("id, name");

    if (citiesError) {
      return {
        imported: 0,
        failed: rows.length,
        errors: [citiesError.message],
      };
    }

    const cityMap = new Map<string, string>();
    for (const c of existingCities ?? []) {
      cityMap.set(c.name.toLowerCase(), c.id);
    }

    const namesToCreate = requestedNames.filter(
      (n) => !cityMap.has(n.toLowerCase()),
    );

    const notices: string[] = [];

    if (namesToCreate.length > 0) {
      const { data: created, error: createError } = await supabase
        .from("cities")
        .insert(namesToCreate.map((name) => ({ name })))
        .select("id, name");

      if (createError) {
        return {
          imported: 0,
          failed: rows.length,
          errors: [`Failed to create new cities: ${createError.message}`],
        };
      }

      for (const c of created ?? []) {
        cityMap.set(c.name.toLowerCase(), c.id);
      }

      notices.push(
        `Created ${created?.length ?? 0} new ${
          (created?.length ?? 0) === 1 ? "city" : "cities"
        }: ${namesToCreate.join(", ")}`,
      );
    }

    // ── Build upsert payload ──
    const errors: string[] = [];
    const validRows: TablesInsert<"monthly_city_tours">[] = [];

    rows.forEach((row, idx) => {
      const key = row.name.trim();
      const employeeId = empMap.get(key);
      if (!employeeId) {
        errors.push(`Row ${idx + 1}: Employee "${row.name}" not found in system`);
        return;
      }

      const cityId = cityMap.get(titleCase(row.city_name).toLowerCase());
      if (!cityId) {
        errors.push(
          `Row ${idx + 1}: City "${row.city_name}" could not be resolved or created`,
        );
        return;
      }

      validRows.push({
        employee_id: employeeId,
        month: row.month,
        year: row.year,
        city_id: cityId,
        target_days: row.target_days,
        actual_days: row.actual_days,
      });
    });

    if (validRows.length > 0) {
      const { error } = await supabase
        .from("monthly_city_tours")
        .upsert(validRows, {
          onConflict: "employee_id,month,year,city_id",
        });

      if (error) {
        return {
          imported: 0,
          failed: rows.length,
          errors: [...errors, error.message],
          notices,
        };
      }
    }

    revalidatePath("/monthly-data");
    return {
      imported: validRows.length,
      failed: errors.length,
      errors,
      notices,
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
