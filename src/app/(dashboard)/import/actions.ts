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
   Partial-upsert header gate
───────────────────────────────────────────────────────────────
   The wizard forwards the exact header row from the uploaded
   CSV/XLSX. We use it to decide which non-key fields belong in
   the Supabase payload:

     header present  →  include key (empty cell still clobbers to
                        its Zod default — 0 for numbers, null for
                        blank text; that is intentional per spec).
     header absent   →  omit key entirely (Supabase then leaves
                        the column untouched on ON CONFLICT UPDATE,
                        which is what preserves existing data).

   PostgREST's bulk-upsert path expects every object in the array
   to share the same shape. Since all rows in a single import
   share the same CSV header row, building payloads with the same
   `has()` decisions across the loop keeps that invariant trivially.
───────────────────────────────────────────────────────────── */
function makeHeaderGate(csvHeaders: string[]) {
  const set = new Set(
    (csvHeaders ?? []).map((h) => h.trim().toLowerCase()),
  );
  return (field: string) => set.has(field);
}

/* ─────────────────────────────────────────────────────────────
   Employees
───────────────────────────────────────────────────────────── */

export async function importEmployees(
  rows: { emp_id: string; name: string; location?: string; state?: string }[],
  csvHeaders: string[],
): Promise<ImportResult> {
  try {
    const supabase = await assertSuperAdmin();
    const has = makeHeaderGate(csvHeaders);

    const upsertData: TablesInsert<"employees">[] = rows.map((row) => {
      const payload: TablesInsert<"employees"> = {
        emp_id: row.emp_id,
        name: row.name,
      };
      if (has("location")) payload.location = row.location?.trim() || null;
      if (has("state")) payload.state = row.state?.trim() || null;
      return payload;
    });

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
  csvHeaders: string[],
): Promise<ImportResult> {
  try {
    const supabase = await assertSuperAdmin();
    const has = makeHeaderGate(csvHeaders);
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

      const payload: TablesInsert<"monthly_targets"> = {
        employee_id: employeeId,
        month: row.month,
        year: row.year,
      };
      if (has("target_client_visits"))
        payload.target_client_visits = row.target_client_visits;
      if (has("target_dispatched_sqft"))
        payload.target_dispatched_sqft = row.target_dispatched_sqft;
      validRows.push(payload);
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
  }[],
  csvHeaders: string[],
): Promise<ImportResult> {
  try {
    const supabase = await assertSuperAdmin();
    const has = makeHeaderGate(csvHeaders);
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

      // total_costing is a GENERATED column in Postgres (salary + tada + incentive);
      // including it in the payload throws `cannot insert a non-DEFAULT value`.
      // sales_promotion is tracked separately and intentionally excluded from the sum.
      const payload: TablesInsert<"monthly_actuals"> = {
        employee_id: employeeId,
        month: row.month,
        year: row.year,
      };
      if (has("actual_client_visits"))
        payload.actual_client_visits = row.actual_client_visits;
      if (has("actual_conversions"))
        payload.actual_conversions = row.actual_conversions;
      if (has("actual_project")) payload.actual_project = row.actual_project;
      if (has("actual_project_2"))
        payload.actual_project_2 = row.actual_project_2;
      if (has("actual_tile")) payload.actual_tile = row.actual_tile;
      if (has("actual_retail")) payload.actual_retail = row.actual_retail;
      if (has("actual_return")) payload.actual_return = row.actual_return;
      if (has("salary")) payload.salary = row.salary;
      if (has("tada")) payload.tada = row.tada;
      if (has("incentive")) payload.incentive = row.incentive;
      if (has("sales_promotion"))
        payload.sales_promotion = row.sales_promotion;
      validRows.push(payload);
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
   Daily Logs — ACTUALS ONLY.
   Feeds the daily_metrics table; `trg_sync_daily_to_monthly` rolls
   these up into monthly_actuals on every upsert. Users skip
   non-working days by omitting them from the CSV.

   Targets (target_calls / target_total_meetings) are intentionally
   NOT in this payload — they are set via the dedicated "Set Target"
   UI on the Daily Logs page. Omitting the keys from the upsert
   means Postgres preserves any existing target on conflict, so a
   bulk actuals import can never clobber a manager-set goal.
───────────────────────────────────────────────────────────── */

export async function importDailyLogs(
  rows: {
    name: string;
    date: string;
    actual_calls: number;
    actual_architect_meetings: number;
    actual_client_meetings: number;
    actual_site_visits: number;
    remarks?: string;
  }[],
  csvHeaders: string[],
): Promise<ImportResult> {
  try {
    const supabase = await assertSuperAdmin();
    const has = makeHeaderGate(csvHeaders);
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

      const payload: TablesInsert<"daily_metrics"> = {
        employee_id: employeeId,
        date: row.date,
      };
      if (has("actual_calls")) payload.actual_calls = row.actual_calls;
      if (has("actual_architect_meetings"))
        payload.actual_architect_meetings = row.actual_architect_meetings;
      if (has("actual_client_meetings"))
        payload.actual_client_meetings = row.actual_client_meetings;
      if (has("actual_site_visits"))
        payload.actual_site_visits = row.actual_site_visits;
      if (has("remarks")) {
        payload.remarks = row.remarks?.trim() ? row.remarks.trim() : null;
      }
      validRows.push(payload);
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
  csvHeaders: string[],
): Promise<ImportResult> {
  try {
    const supabase = await assertSuperAdmin();
    const has = makeHeaderGate(csvHeaders);
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

      const payload: TablesInsert<"monthly_city_tours"> = {
        employee_id: employeeId,
        month: row.month,
        year: row.year,
        city_id: cityId,
      };
      if (has("target_days")) payload.target_days = row.target_days;
      if (has("actual_days")) payload.actual_days = row.actual_days;
      validRows.push(payload);
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

      // ── Sync monthly_targets.target_travelling_cities ──
      // The manual UI's EmployeeDetailDialog aligns the visible tour list to
      // monthly_targets.target_travelling_cities. If we only write to
      // monthly_city_tours and leave the counter at 0, the dialog renders
      // "No travelling cities set" even though the rows exist. Bump the
      // counter up to match the actual distinct-city count per period.
      //
      // Only bumps UP (GREATEST(existing, imported)) so we never clobber a
      // higher plan the manager already set manually.
      const countByKey = new Map<string, number>();
      for (const r of validRows) {
        const key = `${r.employee_id}|${r.month}|${r.year}`;
        countByKey.set(key, (countByKey.get(key) ?? 0) + 1);
      }

      const keyParts = [...countByKey.keys()].map((k) => k.split("|"));
      const employeeIds = [...new Set(keyParts.map(([eid]) => eid))];
      const months = [...new Set(keyParts.map(([, m]) => Number(m)))];
      const years = [...new Set(keyParts.map(([, , y]) => Number(y)))];

      const { data: existingTargets } = await supabase
        .from("monthly_targets")
        .select("employee_id, month, year, target_travelling_cities")
        .in("employee_id", employeeIds)
        .in("month", months)
        .in("year", years);

      const existingMap = new Map(
        (existingTargets ?? []).map((t) => [
          `${t.employee_id}|${t.month}|${t.year}`,
          t.target_travelling_cities ?? 0,
        ]),
      );

      const targetUpserts = [...countByKey.entries()].map(([key, count]) => {
        const [employee_id, m, y] = key.split("|");
        const existing = existingMap.get(key) ?? 0;
        return {
          employee_id,
          month: Number(m),
          year: Number(y),
          target_travelling_cities: Math.max(existing, count),
        };
      });

      const { error: targetSyncError } = await supabase
        .from("monthly_targets")
        .upsert(targetUpserts, { onConflict: "employee_id,month,year" });

      if (targetSyncError) {
        // Non-fatal: tours are already persisted correctly. Surface as a
        // notice so the operator can re-check the count manually if needed.
        notices.push(
          `Tours imported, but failed to sync target_travelling_cities: ${targetSyncError.message}`,
        );
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
