import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  computeKpis,
  computePerformers,
  computeBarData,
  computeMetricCompletions,
} from "./_lib/dashboard-helpers";
import { DashboardShell } from "./_components/dashboard-shell";

export default async function DashboardPage({
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

  const [{ data: employees }, { data: targets }, { data: actuals }] =
    await Promise.all([
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

  const empList = employees ?? [];
  const targetList = targets ?? [];
  const actualList = actuals ?? [];

  const kpis = computeKpis(empList, targetList, actualList);
  const performers = computePerformers(empList, targetList, actualList);
  const barData = computeBarData(kpis);
  const metricCompletions = computeMetricCompletions(kpis);

  return (
    <DashboardShell
      month={month}
      year={year}
      kpis={kpis}
      barData={barData}
      performers={performers.slice(0, 5)}
      metricCompletions={metricCompletions}
    />
  );
}
