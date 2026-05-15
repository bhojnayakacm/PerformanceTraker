import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EmployeeAssignment, ProfileWithCount } from "@/lib/types";
import { UsersDataTable } from "./_components/users-data-table";

export default async function UsersPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  /* manager_assignments is fetched flat (one row per claim) and serves two
   * downstream consumers from a single source of truth on the wire:
   *
   *   (1) the per-Custom-Admin roster count rendered in the table, and
   *   (2) the per-employee lock state shown in the assignment dialog so a
   *       Super Admin can SEE which employees are already claimed before
   *       trying to assign them ("Assigned to Alice" hint, disabled row).
   *
   * Wire size is bounded by employees.length because of UNIQUE(employee_id)
   * — at most one row per employee — so this query is no larger than the
   * employees query running alongside it. We derive both shapes in JS
   * rather than embedding a server-side count aggregate, which would mean
   * two passes over the same data on the database side. */
  const [
    { data: profile },
    { data: profilesRaw },
    { data: employees },
    { data: rawAssignments },
  ] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true }),
    supabase
      .from("employees")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase.from("manager_assignments").select("employee_id, manager_id"),
  ]);

  // Roster size per manager — bucket-count the flat assignments.
  const countByManager = new Map<string, number>();
  for (const a of rawAssignments ?? []) {
    countByManager.set(a.manager_id, (countByManager.get(a.manager_id) ?? 0) + 1);
  }

  const profiles: ProfileWithCount[] = (profilesRaw ?? []).map((p) => ({
    ...p,
    assignmentCount: countByManager.get(p.id) ?? 0,
  }));

  // Resolve manager_id → display name once, off the already-loaded profiles
  // list, so the dialog never has to do its own name lookup.
  const nameById = new Map<string, string>();
  for (const p of profilesRaw ?? []) {
    nameById.set(p.id, p.full_name ?? "Custom Admin");
  }
  const assignments: EmployeeAssignment[] = (rawAssignments ?? []).map((a) => ({
    employee_id: a.employee_id,
    manager_id: a.manager_id,
    manager_name: nameById.get(a.manager_id) ?? "Custom Admin",
  }));

  if (profile?.role !== "super_admin") {
    return (
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="shrink-0">
          <h1 className="text-2xl font-bold tracking-tight">
            User Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage application users and their roles.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-muted-foreground shadow-[0_1px_2px_0_rgba(15,23,42,0.04)]">
          <p>Only Super Admins can manage users.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
        <p className="text-muted-foreground mt-1">
          Manage application users and their roles.
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <UsersDataTable
          data={profiles}
          currentUserId={user.id}
          employees={employees ?? []}
          assignments={assignments}
        />
      </div>
    </div>
  );
}
