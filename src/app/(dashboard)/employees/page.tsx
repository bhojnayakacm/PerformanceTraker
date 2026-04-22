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

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Employees</h1>
        <p className="text-muted-foreground mt-1">
          Manage employee records and details.
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <EmployeeDataTable data={employees} userRole={userRole} />
      </div>
    </div>
  );
}
