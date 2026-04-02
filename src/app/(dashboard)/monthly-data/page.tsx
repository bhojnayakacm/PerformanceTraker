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

  // Determine if viewing the current month for MTD pacing
  const isCurrentMonth =
    month === now.getMonth() + 1 && year === now.getFullYear();

  // For current month, compute Month-to-Date targets from daily_metrics
  const mtdCallTargets: Record<string, number> = {};
  const mtdMeetingTargets: Record<string, number> = {};

  if (isCurrentMonth) {
    const pad = (n: number) => String(n).padStart(2, "0");
    const today = `${year}-${pad(month)}-${pad(now.getDate())}`;

    const { data: dailyRows } = await supabase
      .from("daily_metrics")
      .select("employee_id, target_calls, target_total_meetings")
      .gte("date", `${year}-${pad(month)}-01`)
      .lte("date", today);

    for (const row of dailyRows ?? []) {
      mtdCallTargets[row.employee_id] =
        (mtdCallTargets[row.employee_id] ?? 0) + row.target_calls;
      mtdMeetingTargets[row.employee_id] =
        (mtdMeetingTargets[row.employee_id] ?? 0) +
        row.target_total_meetings;
    }
  }

  // Merge employees with their target/actual data
  const data: EmployeeMonthlyData[] = (employees ?? []).map((emp) => {
    const target = targets?.find((t) => t.employee_id === emp.id) ?? null;
    const actual = actuals?.find((a) => a.employee_id === emp.id) ?? null;

    // For current month, override synced targets with MTD pacing values
    if (isCurrentMonth && target) {
      return {
        employee: emp,
        target: {
          ...target,
          target_total_calls: mtdCallTargets[emp.id] ?? 0,
          target_total_meetings: mtdMeetingTargets[emp.id] ?? 0,
        },
        actual,
      };
    }

    return { employee: emp, target, actual };
  });

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
        isCurrentMonth={isCurrentMonth}
      />
    </div>
  );
}
