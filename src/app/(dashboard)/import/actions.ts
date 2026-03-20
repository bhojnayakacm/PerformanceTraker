"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/types/database.types";

type ImportResult =
  | { imported: number; failed: number; errors: string[] }
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

export async function importEmployees(
  rows: { emp_id: string; name: string; location?: string }[]
): Promise<ImportResult> {
  try {
    const supabase = await assertSuperAdmin();

    const upsertData = rows.map((row) => ({
      emp_id: row.emp_id,
      name: row.name,
      location: row.location || null,
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

export async function importTargets(
  rows: {
    emp_id: string;
    month: number;
    year: number;
    target_total_meetings: number;
    target_total_calls: number;
    target_client_visits: number;
    target_dispatched_sqft: number;
    target_tour_days: number;
    target_travelling_cities: number;
  }[]
): Promise<ImportResult> {
  try {
    const supabase = await assertSuperAdmin();

    // Resolve emp_id → employee_id
    const empIds = [...new Set(rows.map((r) => r.emp_id))];
    const { data: employees } = await supabase
      .from("employees")
      .select("id, emp_id")
      .in("emp_id", empIds);

    const empMap = new Map(employees?.map((e) => [e.emp_id, e.id]) ?? []);

    const errors: string[] = [];
    const validRows: {
      employee_id: string;
      month: number;
      year: number;
      target_total_meetings: number;
      target_total_calls: number;
      target_client_visits: number;
      target_dispatched_sqft: number;
      target_tour_days: number;
      target_travelling_cities: number;
    }[] = [];

    for (const row of rows) {
      const employeeId = empMap.get(row.emp_id);
      if (!employeeId) {
        errors.push(`Employee "${row.emp_id}" not found in database`);
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { emp_id: _empId, ...rest } = row;
      validRows.push({ ...rest, employee_id: employeeId });
    }

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

export async function importActuals(
  rows: {
    emp_id: string;
    month: number;
    year: number;
    actual_calls: number;
    actual_architect_meetings: number;
    actual_client_meetings: number;
    actual_site_visits: number;
    actual_client_visits: number;
    actual_dispatched_sqft: number;
    actual_dispatched_amount: number;
    actual_conversions: number;
    actual_tour_days: number;
    actual_travelling_cities?: string;
    salary: number;
    tada: number;
    incentive: number;
    sales_promotion: number;
  }[]
): Promise<ImportResult> {
  try {
    const supabase = await assertSuperAdmin();

    // Resolve emp_id → employee_id
    const empIds = [...new Set(rows.map((r) => r.emp_id))];
    const { data: employees } = await supabase
      .from("employees")
      .select("id, emp_id")
      .in("emp_id", empIds);

    const empMap = new Map(employees?.map((e) => [e.emp_id, e.id]) ?? []);

    const errors: string[] = [];
    const validRows: TablesInsert<"monthly_actuals">[] = [];

    for (const row of rows) {
      const employeeId = empMap.get(row.emp_id);
      if (!employeeId) {
        errors.push(`Employee "${row.emp_id}" not found in database`);
        continue;
      }

      const cities = row.actual_travelling_cities
        ? row.actual_travelling_cities
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : null;

      validRows.push({
        employee_id: employeeId,
        month: row.month,
        year: row.year,
        actual_calls: row.actual_calls,
        actual_architect_meetings: row.actual_architect_meetings,
        actual_client_meetings: row.actual_client_meetings,
        actual_site_visits: row.actual_site_visits,
        actual_client_visits: row.actual_client_visits,
        actual_dispatched_sqft: row.actual_dispatched_sqft,
        actual_dispatched_amount: row.actual_dispatched_amount,
        actual_conversions: row.actual_conversions,
        actual_tour_days: row.actual_tour_days,
        actual_travelling_cities: cities,
        salary: row.salary,
        tada: row.tada,
        incentive: row.incentive,
        sales_promotion: row.sales_promotion,
      });
    }

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
