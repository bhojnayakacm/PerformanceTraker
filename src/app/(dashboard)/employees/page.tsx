import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";
import { EmployeeDataTable } from "./_components/employee-data-table";

export default async function EmployeesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: employees }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase.from("employees").select("*").order("name", { ascending: true }),
  ]);

  const userRole = (profile?.role ?? "viewer") as UserRole;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Employees</h1>
        <p className="text-muted-foreground mt-1">
          Manage employee records and details.
        </p>
      </div>
      <EmployeeDataTable data={employees ?? []} userRole={userRole} />
    </div>
  );
}
