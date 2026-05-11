"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  employeeCreateSchema,
  employeeUpdateSchema,
  type EmployeeCreateInput,
  type EmployeeUpdateInput,
} from "@/lib/validators/employee";

type ActionResult = { success: true } | { error: string; field?: string };

/* ── 23505 disambiguation ──────────────────────────────────────────────────
 *
 * Both emp_id and name are unique on employees (the latter via
 * 0011_unique_employee_name.sql). Postgres returns the same SQLSTATE 23505
 * for either collision, so the action has to inspect the message/details
 * to attribute the violation to the right form field.
 *
 * PostgrestError surfaces the constraint name in `error.message` like:
 *   `duplicate key value violates unique constraint "employees_name_unique"`
 * and the offending key in `error.details` like:
 *   `Key (name)=(John Doe) already exists.`
 *
 * We sniff for the constraint name in `message` first (cheaper, more
 * specific than a regex against `details`), then fall back to a generic
 * "this ID already exists" wording if Supabase ever returns a 23505 we
 * don't recognise — better than rendering raw SQL to the operator.
 * ─────────────────────────────────────────────────────────────────────── */
function explain23505(error: {
  message?: string | null;
  details?: string | null;
}): { error: string; field: "emp_id" | "name" } {
  const msg = `${error.message ?? ""} ${error.details ?? ""}`;
  if (/employees_name_unique|Key \(name\)/i.test(msg)) {
    return {
      error: "An employee with this exact name already exists.",
      field: "name",
    };
  }
  // Default branch covers `employees_emp_id_key` and any unrecognised
  // 23505 — emp_id is the historical primary uniqueness contract, so
  // it's the safer default than no field attribution at all.
  return {
    error: "An employee with this ID already exists.",
    field: "emp_id",
  };
}

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

  return supabase;
}

export async function createEmployee(
  input: EmployeeCreateInput
): Promise<ActionResult> {
  const parsed = employeeCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  try {
    const supabase = await assertSuperAdmin();

    const { error } = await supabase.from("employees").insert({
      emp_id: parsed.data.emp_id,
      name: parsed.data.name,
      location: parsed.data.location || null,
      state: parsed.data.state || null,
      date_of_joining: parsed.data.date_of_joining || null,
      reporting_manager_id: parsed.data.reporting_manager_id || null,
    });

    if (error) {
      if (error.code === "23505") return explain23505(error);
      return { error: error.message };
    }

    revalidatePath("/employees");
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function updateEmployee(
  input: EmployeeUpdateInput
): Promise<ActionResult> {
  const parsed = employeeUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  try {
    const supabase = await assertSuperAdmin();

    const { error } = await supabase
      .from("employees")
      .update({
        emp_id: parsed.data.emp_id,
        name: parsed.data.name,
        location: parsed.data.location || null,
        state: parsed.data.state || null,
        date_of_joining: parsed.data.date_of_joining || null,
        reporting_manager_id: parsed.data.reporting_manager_id || null,
      })
      .eq("id", parsed.data.id);

    if (error) {
      if (error.code === "23505") return explain23505(error);
      return { error: error.message };
    }

    revalidatePath("/employees");
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function toggleEmployeeStatus(
  id: string,
  currentStatus: boolean
): Promise<ActionResult> {
  try {
    const supabase = await assertSuperAdmin();

    const { error } = await supabase
      .from("employees")
      .update({ is_active: !currentStatus })
      .eq("id", id);

    if (error) return { error: error.message };

    revalidatePath("/employees");
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
