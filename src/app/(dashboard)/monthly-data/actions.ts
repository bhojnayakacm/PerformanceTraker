"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertManagerEmployeeAccess } from "@/lib/queries/employees";
import {
  monthlyDataSchema,
  type MonthlyDataInput,
} from "@/lib/validators/monthly-data";
import type { City } from "@/lib/types";

type ActionResult = { success: true } | { error: string };

type SaveInput = MonthlyDataInput & {
  employeeId: string;
  month: number;
  year: number;
};

async function getAuthenticatedRole() {
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

  return {
    supabase,
    userId: user.id,
    role: (profile?.role ?? "viewer") as string,
  };
}

/* ─────────────────────────────────────────────────────────────
   saveMonthlyData
   — Upserts monthly_targets, monthly_actuals, AND diffs the
     monthly_city_tours set for the (employee, month, year).
   ───────────────────────────────────────────────────────────── */
export async function saveMonthlyData(
  input: SaveInput
): Promise<ActionResult> {
  const { employeeId, month, year, ...values } = input;

  const parsed = monthlyDataSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  try {
    const { supabase, userId, role } = await getAuthenticatedRole();

    if (role === "viewer") {
      return { error: "You don't have permission to edit data" };
    }

    const canEditTargets = role === "super_admin" || role === "custom_admin";

    if (role === "custom_admin") {
      const hasAccess = await assertManagerEmployeeAccess(
        supabase,
        userId,
        [employeeId]
      );
      if (!hasAccess) {
        return { error: "You don't have access to this employee" };
      }
    }

    const data = parsed.data;

    // ── Upsert targets (super_admin / manager only) ──
    if (canEditTargets) {
      const { error: targetError } = await supabase
        .from("monthly_targets")
        .upsert(
          {
            employee_id: employeeId,
            month,
            year,
            target_client_visits: data.target_client_visits,
            target_dispatched_sqft: data.target_dispatched_sqft,
            target_travelling_cities: data.target_travelling_cities,
          },
          { onConflict: "employee_id,month,year" }
        );

      if (targetError) return { error: targetError.message };
    }

    // ── Upsert actuals ──
    // Generated columns (actual_net_sale, actual_dispatched_sqft) are
    // auto-filled by Postgres — DO NOT include them in the payload.
    const { error: actualError } = await supabase
      .from("monthly_actuals")
      .upsert(
        {
          employee_id: employeeId,
          month,
          year,
          actual_client_visits: data.actual_client_visits,
          actual_conversions: data.actual_conversions,
          actual_project_2: data.actual_project_2,
          actual_project: data.actual_project,
          actual_tile: data.actual_tile,
          actual_retail: data.actual_retail,
          actual_return: data.actual_return,
          salary: data.salary,
          tada: data.tada,
          incentive: data.incentive,
          sales_promotion: data.sales_promotion,
        },
        { onConflict: "employee_id,month,year" }
      );

    if (actualError) return { error: actualError.message };

    /* ── Diff monthly_city_tours ──────────────────────────────────────────
     *
     * The dialog now lets a Super Admin remove an individual card (not just
     * trim the tail via the master "Target Cities" counter), so the submitted
     * set is no longer guaranteed to be a prefix of the persisted set. We
     * sync via the recommended diff pattern:
     *
     *   (1) DELETE rows whose city_id is NOT in the submitted set. This is
     *       the orphan-removal step — a city removed in the UI maps to a row
     *       deleted here. When the user removed every card, the NOT IN
     *       predicate is dropped and all existing rows for the period go.
     *
     *   (2) UPSERT the submitted set onto UNIQUE(employee_id, month, year,
     *       city_id). New cities are inserted; cities the user kept have
     *       their target_days/actual_days refreshed in place, preserving the
     *       row id and created_at.
     *
     * Compared with the old "DELETE all + INSERT all" approach this:
     *   - preserves DB row identity for unchanged cities (no churn),
     *   - shrinks the partial-failure blast radius — if the upsert errors,
     *     the kept rows still exist instead of being collateral damage from
     *     the wholesale delete.
     * ────────────────────────────────────────────────────────────────── */

    const submittedCityIds = data.city_tours.map((t) => t.city_id);

    let deleteQuery = supabase
      .from("monthly_city_tours")
      .delete()
      .eq("employee_id", employeeId)
      .eq("month", month)
      .eq("year", year);

    if (submittedCityIds.length > 0) {
      // PostgREST `not.in.(…)` filter. Zod already validated each entry as a
      // UUID upstream, so inlining without quoting is safe.
      deleteQuery = deleteQuery.not(
        "city_id",
        "in",
        `(${submittedCityIds.join(",")})`,
      );
    }

    const { error: deleteError } = await deleteQuery;
    if (deleteError) return { error: deleteError.message };

    if (data.city_tours.length > 0) {
      const rows = data.city_tours.map((t) => ({
        employee_id: employeeId,
        month,
        year,
        city_id: t.city_id,
        target_days: t.target_days,
        actual_days: t.actual_days,
      }));

      const { error: upsertError } = await supabase
        .from("monthly_city_tours")
        .upsert(rows, { onConflict: "employee_id,month,year,city_id" });

      if (upsertError) return { error: upsertError.message };
    }

    revalidatePath("/monthly-data");
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/* ─────────────────────────────────────────────────────────────
   City pool management
   ───────────────────────────────────────────────────────────── */

export async function getCities(): Promise<City[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cities")
    .select("*")
    .order("name", { ascending: true });
  return data ?? [];
}

export async function addCity(name: string): Promise<ActionResult> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "City name cannot be empty" };
  if (trimmed.length > 64) return { error: "City name is too long" };

  try {
    const { supabase, role } = await getAuthenticatedRole();

    if (role !== "super_admin") {
      return { error: "Only Super Admins can add cities" };
    }

    const { error } = await supabase
      .from("cities")
      .insert({ name: trimmed });

    if (error) {
      if (error.code === "23505") {
        return { error: `"${trimmed}" already exists in the pool` };
      }
      return { error: error.message };
    }

    revalidatePath("/monthly-data");
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function updateCity(
  id: string,
  name: string
): Promise<ActionResult> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "City name cannot be empty" };
  if (trimmed.length > 64) return { error: "City name is too long" };

  try {
    const { supabase, role } = await getAuthenticatedRole();

    if (role !== "super_admin") {
      return { error: "Only Super Admins can edit cities" };
    }

    const { error } = await supabase
      .from("cities")
      .update({ name: trimmed })
      .eq("id", id);

    if (error) {
      if (error.code === "23505") {
        return { error: `"${trimmed}" already exists in the pool` };
      }
      return { error: error.message };
    }

    revalidatePath("/monthly-data");
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function deleteCity(id: string): Promise<ActionResult> {
  try {
    const { supabase, role } = await getAuthenticatedRole();

    if (role !== "super_admin") {
      return { error: "Only Super Admins can delete cities" };
    }

    const { error } = await supabase.from("cities").delete().eq("id", id);

    if (error) {
      if (error.code === "23503") {
        return {
          error:
            "Cannot delete this city because it is currently assigned to one or more employees/records.",
        };
      }
      return { error: error.message };
    }

    revalidatePath("/monthly-data");
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
