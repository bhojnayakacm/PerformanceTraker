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

    const canEditTargets = role === "super_admin" || role === "manager";

    if (role === "manager") {
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

    // ── Diff monthly_city_tours (delete-then-insert is cleanest for small sets) ──
    const { error: deleteError } = await supabase
      .from("monthly_city_tours")
      .delete()
      .eq("employee_id", employeeId)
      .eq("month", month)
      .eq("year", year);

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

      const { error: insertError } = await supabase
        .from("monthly_city_tours")
        .insert(rows);

      if (insertError) return { error: insertError.message };
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
