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
    });

    if (error) {
      if (error.code === "23505") {
        return { error: "An employee with this ID already exists", field: "emp_id" };
      }
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
      })
      .eq("id", parsed.data.id);

    if (error) {
      if (error.code === "23505") {
        return { error: "An employee with this ID already exists", field: "emp_id" };
      }
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
