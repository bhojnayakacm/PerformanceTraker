"use server";

import { createClient } from "@/lib/supabase/server";
import type { ReportFilters, ReportRow } from "./_lib/report-types";

type ActionResult =
  | { success: true; data: ReportRow[] }
  | { success: false; error: string };

/**
 * Generate month/year pairs from a range.
 * E.g. (1,2025) -> (3,2025) = [{1,2025},{2,2025},{3,2025}]
 */
function expandMonthRange(
  fromMonth: number,
  fromYear: number,
  toMonth: number,
  toYear: number
): { month: number; year: number }[] {
  const pairs: { month: number; year: number }[] = [];
  let m = fromMonth;
  let y = fromYear;

  while (y < toYear || (y === toYear && m <= toMonth)) {
    pairs.push({ month: m, year: y });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }

  // Safety cap
  if (pairs.length > 24) return pairs.slice(0, 24);
  return pairs;
}

export async function generateReport(
  filters: ReportFilters
): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized" };

  // Validate range
  const fromVal = filters.fromYear * 12 + filters.fromMonth;
  const toVal = filters.toYear * 12 + filters.toMonth;
  if (fromVal > toVal) {
    return { success: false, error: "'From' date must be before 'To' date." };
  }

  // Fetch employees
  let employeeQuery = supabase
    .from("employees")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (filters.employeeId !== "all") {
    employeeQuery = employeeQuery.eq("id", filters.employeeId);
  }

  const { data: employees, error: empError } = await employeeQuery;
  if (empError) return { success: false, error: empError.message };
  if (!employees || employees.length === 0) {
    return { success: true, data: [] };
  }

  const monthPairs = expandMonthRange(
    filters.fromMonth,
    filters.fromYear,
    filters.toMonth,
    filters.toYear
  );

  const employeeIds = employees.map((e) => e.id);

  // Fetch all targets and actuals for the range in bulk
  // We filter by the min/max year range and then filter in JS for exact month/year pairs
  const minYear = filters.fromYear;
  const maxYear = filters.toYear;

  const targetQuery = supabase
    .from("monthly_targets")
    .select("*")
    .in("employee_id", employeeIds)
    .gte("year", minYear)
    .lte("year", maxYear);

  const actualQuery = supabase
    .from("monthly_actuals")
    .select("*")
    .in("employee_id", employeeIds)
    .gte("year", minYear)
    .lte("year", maxYear);

  const [{ data: targets }, { data: actuals }] = await Promise.all([
    targetQuery,
    actualQuery,
  ]);

  // Build lookup maps: key = "employeeId-month-year"
  const targetMap = new Map(
    (targets ?? []).map((t) => [`${t.employee_id}-${t.month}-${t.year}`, t])
  );
  const actualMap = new Map(
    (actuals ?? []).map((a) => [`${a.employee_id}-${a.month}-${a.year}`, a])
  );

  // Build rows
  const rows: ReportRow[] = [];

  for (const emp of employees) {
    for (const { month, year } of monthPairs) {
      const key = `${emp.id}-${month}-${year}`;
      const t = targetMap.get(key);
      const a = actualMap.get(key);

      const salary = a?.salary ?? 0;
      const tada = a?.tada ?? 0;
      const incentive = a?.incentive ?? 0;
      const salesPromotion = a?.sales_promotion ?? 0;

      rows.push({
        employeeName: emp.name,
        empId: emp.emp_id,
        location: emp.location ?? "",
        month,
        year,
        targetMeetings: t?.target_total_meetings ?? 0,
        actualMeetings:
          (a?.actual_architect_meetings ?? 0) +
          (a?.actual_client_meetings ?? 0) +
          (a?.actual_site_visits ?? 0),
        targetCalls: t?.target_total_calls ?? 0,
        actualCalls: a?.actual_calls ?? 0,
        targetClientVisits: t?.target_client_visits ?? 0,
        actualClientVisits: a?.actual_client_visits ?? 0,
        targetDispatchSqft: t?.target_dispatched_sqft ?? 0,
        actualDispatchSqft: a?.actual_dispatched_sqft ?? 0,
        actualDispatchAmount: a?.actual_dispatched_amount ?? 0,
        targetTourDays: t?.target_tour_days ?? 0,
        actualTourDays: a?.actual_tour_days ?? 0,
        actualConversions: a?.actual_conversions ?? 0,
        salary,
        tada,
        incentive,
        salesPromotion,
        totalCosting: salary + tada + incentive + salesPromotion,
      });
    }
  }

  return { success: true, data: rows };
}
