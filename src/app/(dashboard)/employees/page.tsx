import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";
import { getEmployeesForUser } from "@/lib/queries/employees";
import { EmployeeDataTable } from "./_components/employee-data-table";

export default async function EmployeesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const userRole = (profile?.role ?? "viewer") as UserRole;
  const employees = await getEmployeesForUser(supabase, user.id, userRole);

  const totalCount = employees.length;
  const activeCount = employees.filter((e) => e.is_active).length;
  const inactiveCount = totalCount - activeCount;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Employees</h1>
          <p className="text-muted-foreground mt-1">
            Manage employee records and details.
          </p>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <span className="inline-flex items-baseline gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-700 shadow-sm">
            Total:
            <span className="font-semibold tabular-nums">{totalCount}</span>
          </span>
          <span className="inline-flex items-baseline gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
            Active:
            <span className="font-semibold tabular-nums">{activeCount}</span>
          </span>
          <span className="inline-flex items-baseline gap-1.5 rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-sm font-medium text-rose-700">
            Inactive:
            <span className="font-semibold tabular-nums">{inactiveCount}</span>
          </span>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <EmployeeDataTable data={employees} userRole={userRole} />
      </div>
    </div>
  );
}
