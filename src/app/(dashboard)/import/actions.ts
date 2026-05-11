"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TablesInsert, TablesUpdate } from "@/types/database.types";

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
  rows: {
    /* Required. Globally unique per migration 0011 (employees_name_unique),
     * which is what makes name a safe upsert key. */
    name: string;
    /* Optional. When present, takes precedence as the upsert key. Required
     * only for *creating* new employees — the DB column is NOT NULL, so a
     * name-only row that doesn't match an existing record is rejected
     * per-row rather than silently inserted with a placeholder. */
    emp_id?: string;
    location?: string;
    state?: string;
    /* Already normalised to YYYY-MM-DD by the Zod preprocessor in
     * import-helpers.ts. The server action stays a thin pass-through —
     * it does not re-parse, since validateRows() already rejected
     * malformed dates before they reached the upsert. */
    date_of_joining?: string;
    /* Name-keyed manager reference. Server resolves name → employees.id
     * after phase 1, so managers created earlier in the same CSV become
     * resolvable for their reports. Resolution failures (unknown name,
     * or a manager who is themselves a junior) become per-row errors. */
    reporting_manager_name?: string;
  }[],
  csvHeaders: string[],
): Promise<ImportResult> {
  try {
    const supabase = await assertSuperAdmin();
    const has = makeHeaderGate(csvHeaders);

    /* ── Row-identity contract ──────────────────────────────────────────
     *
     * For each row we pick the conflict key once and reuse it for every
     * subsequent operation on that row (phase-2 FK update, error reporting,
     * the failedRowKeys set). emp_id wins when present so a CSV can correct
     * a typo in an existing employee's *name* — the row identifier comes
     * from emp_id, the `name` field in the payload becomes the new value.
     *
     * When emp_id is absent, the unique `name` constraint (0011) carries
     * the load — the row identifier IS the name, and the upsert/update
     * keys off name. */
    type RowKey = { col: "emp_id" | "name"; val: string };
    const rowKey = (r: {
      emp_id?: string;
      name: string;
    }): RowKey => {
      const e = r.emp_id?.trim();
      if (e) return { col: "emp_id", val: e };
      return { col: "name", val: r.name.trim() };
    };

    /* ── Bucket rows by which key they upsert against ──────────────────
     *
     * PostgREST's `.upsert(..., { onConflict })` only accepts one conflict
     * column per call, so a mixed CSV is split into two buckets that run
     * sequentially. Both buckets share the same partial-payload semantics
     * via the header gate. */
    const withEmpId = rows.filter((r) => Boolean(r.emp_id?.trim()));
    const nameOnly = rows.filter((r) => !r.emp_id?.trim());

    const errors: string[] = [];
    const failedRowKeys = new Set<string>();
    const failKey = (k: RowKey) => `${k.col}=${k.val}`;

    /* ── Phase 1a — bulk upsert by emp_id ──
     *
     * Bulk because emp_id collisions (the only foreseeable error here) are
     * already caught at parse-time by the Zod max-length rule, and the DB's
     * unique constraint is the same shape the upsert is keying on — a
     * conflicting row updates in place, it doesn't error.
     *
     * `reporting_manager_id` is OMITTED from the payload so a blank
     * `reporting_manager_name` cell with the column-present-in-header path
     * doesn't clobber an existing FK to NULL. Phase 2 handles that case
     * explicitly. */
    if (withEmpId.length > 0) {
      const payloadA: TablesInsert<"employees">[] = withEmpId.map((row) => {
        const p: TablesInsert<"employees"> = {
          emp_id: row.emp_id!.trim(),
          name: row.name.trim(),
        };
        if (has("location")) p.location = row.location?.trim() || null;
        if (has("state")) p.state = row.state?.trim() || null;
        if (has("date_of_joining"))
          p.date_of_joining = row.date_of_joining?.trim() || null;
        return p;
      });

      const { error } = await supabase
        .from("employees")
        .upsert(payloadA, { onConflict: "emp_id" });

      if (error) {
        // Bulk upsert is all-or-nothing per PostgREST. We can't attribute
        // the failure to a single row from here, so the whole bucket is
        // marked failed; the operator gets the SQLSTATE-rich message and
        // can fix the offending row in the CSV.
        errors.push(`Bulk emp_id upsert failed: ${error.message}`);
        for (const r of withEmpId) failedRowKeys.add(failKey(rowKey(r)));
      }
    }

    /* ── Phase 1b — name-keyed updates ──
     *
     * Name-only rows MUST already exist in the DB (emp_id is NOT NULL, so
     * we can't insert without it). We do a single name → id lookup, then
     * fire per-row UPDATEs. Per-row is mandatory here because the upsert
     * path would need `emp_id` in the payload, which we don't have.
     *
     * Note: we deliberately don't use `.upsert(..., { onConflict: "name" })`
     * for this bucket. That call would still need a complete row including
     * `emp_id` for the INSERT case — and the whole point of bucket B is
     * that emp_id is missing. The INSERT case is an error, not a silent
     * one. */
    if (nameOnly.length > 0) {
      const names = [...new Set(nameOnly.map((r) => r.name.trim()))];
      const { data: existing, error: lookupError } = await supabase
        .from("employees")
        .select("id, name")
        .in("name", names);

      if (lookupError) {
        return {
          imported: 0,
          failed: rows.length,
          errors: [...errors, `Name-keyed lookup failed: ${lookupError.message}`],
        };
      }

      const nameToId = new Map<string, string>();
      for (const e of existing ?? []) nameToId.set(e.name, e.id);

      for (const row of nameOnly) {
        const key = rowKey(row);
        const id = nameToId.get(row.name.trim());
        if (!id) {
          errors.push(
            `Row "${row.name}": cannot create new employee without emp_id (name-only rows only update existing records)`,
          );
          failedRowKeys.add(failKey(key));
          continue;
        }

        // TablesUpdate (not TablesInsert) — every column is optional here
        // because the row already exists; we only patch the fields the
        // header gate let through. `name` flows through too in case the
        // caller wants to rename — except the row identifier IS the name
        // here, so persisting it is a no-op.
        const u: TablesUpdate<"employees"> = { name: row.name.trim() };
        if (has("location")) u.location = row.location?.trim() || null;
        if (has("state")) u.state = row.state?.trim() || null;
        if (has("date_of_joining"))
          u.date_of_joining = row.date_of_joining?.trim() || null;

        const { error: updateError } = await supabase
          .from("employees")
          .update(u)
          .eq("id", id);
        if (updateError) {
          errors.push(`Row "${row.name}": ${updateError.message}`);
          failedRowKeys.add(failKey(key));
        }
      }
    }

    /* ── Phase 2 — reporting_manager_name resolution + FK update ──
     *
     * Lookup map keys are NAMES this time (the unique constraint from
     * migration 0011 makes that safe). Rows that failed phase 1 are
     * skipped — there's no point trying to assign a manager to a row
     * that didn't land. */
    let updatedManagerCount = 0;
    if (has("reporting_manager_name")) {
      const referencedNames = [
        ...new Set(
          rows
            .map((r) => r.reporting_manager_name?.trim())
            .filter((s): s is string => Boolean(s)),
        ),
      ];

      const managerMap = new Map<
        string,
        { id: string; reporting_manager_id: string | null }
      >();
      if (referencedNames.length > 0) {
        const { data: managerRows, error: lookupError } = await supabase
          .from("employees")
          .select("id, name, reporting_manager_id")
          .in("name", referencedNames);

        if (lookupError) {
          return {
            imported: rows.length - failedRowKeys.size,
            failed: failedRowKeys.size,
            errors: [
              ...errors,
              `Failed to resolve reporting managers: ${lookupError.message}`,
            ],
          };
        }

        for (const m of managerRows ?? []) {
          managerMap.set(m.name, {
            id: m.id,
            reporting_manager_id: m.reporting_manager_id,
          });
        }
      }

      for (const row of rows) {
        const key = rowKey(row);
        if (failedRowKeys.has(failKey(key))) continue;

        const refName = row.reporting_manager_name?.trim();

        if (!refName) {
          // Blank cell with header present → promote to Tier-1 (clear FK).
          const { error: clearError } = await supabase
            .from("employees")
            .update({ reporting_manager_id: null })
            .eq(key.col, key.val);
          if (clearError) {
            errors.push(`Row "${row.name}": ${clearError.message}`);
          }
          continue;
        }

        if (refName === row.name.trim()) {
          errors.push(
            `Row "${row.name}": cannot set reporting_manager_name to itself`,
          );
          continue;
        }

        const manager = managerMap.get(refName);
        if (!manager) {
          errors.push(
            `Row "${row.name}": reporting_manager_name "${refName}" was not found in the system`,
          );
          continue;
        }
        if (manager.reporting_manager_id != null) {
          errors.push(
            `Row "${row.name}": "${refName}" cannot be a manager (they themselves report to someone — 2-tier limit)`,
          );
          continue;
        }

        const { error: updateError } = await supabase
          .from("employees")
          .update({ reporting_manager_id: manager.id })
          .eq(key.col, key.val);

        if (updateError) {
          errors.push(`Row "${row.name}": ${updateError.message}`);
          continue;
        }
        updatedManagerCount++;
      }
    }

    revalidatePath("/employees");
    revalidatePath("/import");

    /* `imported` counts rows whose core record landed (phase 1 success).
     * Phase-2 manager-resolution failures surface as warnings in `errors`
     * but don't reduce the imported count — the employee row itself is
     * present and queryable, the FK assignment can be re-attempted by
     * uploading a follow-up file with the same name + correct manager. */
    const noticeBits: string[] = [];
    if (has("reporting_manager_name")) {
      noticeBits.push(
        `Linked ${updatedManagerCount} reporting manager${updatedManagerCount === 1 ? "" : "s"}`,
      );
    }

    return {
      imported: rows.length - failedRowKeys.size,
      failed: failedRowKeys.size,
      errors,
      notices: noticeBits.length > 0 ? noticeBits : undefined,
    };
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
