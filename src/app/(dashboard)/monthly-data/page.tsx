import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole, EmployeeMonthlyData } from "@/lib/types";
import { PerformanceGrid } from "./_components/performance-grid";

export default async function MonthlyDataPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const params = await searchParams;
  const now = new Date();
  const month = params.month ? parseInt(params.month) : now.getMonth() + 1;
  const year = params.year ? parseInt(params.year) : now.getFullYear();

  const [{ data: profile }, { data: employees }, { data: targets }, { data: actuals }] =
    await Promise.all([
      supabase.from("profiles").select("role").eq("id", user.id).single(),
      supabase
        .from("employees")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase
        .from("monthly_targets")
        .select("*")
        .eq("month", month)
        .eq("year", year),
      supabase
        .from("monthly_actuals")
        .select("*")
        .eq("month", month)
        .eq("year", year),
    ]);

  const userRole = (profile?.role ?? "viewer") as UserRole;

  // Merge employees with their target/actual data for the selected month
  const data: EmployeeMonthlyData[] = (employees ?? []).map((emp) => ({
    employee: emp,
    target: targets?.find((t) => t.employee_id === emp.id) ?? null,
    actual: actuals?.find((a) => a.employee_id === emp.id) ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Monthly Data</h1>
        <p className="text-muted-foreground mt-1">
          Track monthly targets and actuals for all employees.
        </p>
      </div>
      <PerformanceGrid
        data={data}
        userRole={userRole}
        month={month}
        year={year}
      />
    </div>
  );
}
