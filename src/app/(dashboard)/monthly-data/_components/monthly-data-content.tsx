import { redirect } from "next/navigation";
import type { EmployeeMonthlyData, CityTourWithCity } from "@/lib/types";
import { getAuthUser } from "@/lib/queries/auth";
import { getEmployeesForUser } from "@/lib/queries/employees";
import { PerformanceGrid } from "./performance-grid";

type Props = {
  month: number;
  year: number;
  query: string;
};

export async function MonthlyDataContent({ month, year, query }: Props) {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  const { supabase, id: userId, role: userRole } = auth;

  const [
    employees,
    { data: targets },
    { data: actuals },
    { data: cityTours },
    { data: cities },
  ] = await Promise.all([
    getEmployeesForUser(supabase, userId, userRole, {
      activeOnly: true,
      search: query,
    }),
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
    supabase
      .from("monthly_city_tours")
      .select("*, city:cities(id, name)")
      .eq("month", month)
      .eq("year", year),
    supabase.from("cities").select("*").order("name", { ascending: true }),
  ]);

  // Determine if the selected month is current, past, or in the future.
  // We recompute cumulative rollups for current + past (both benefit from
  // calendar-aware sparse-day filling); future months have no actuals to
  // account for, so we leave them untouched.
  const now = new Date();
  const isCurrentMonth =
    month === now.getMonth() + 1 && year === now.getFullYear();
  const isPastMonth =
    year < now.getFullYear() ||
    (year === now.getFullYear() && month < now.getMonth() + 1);
  const shouldRecompute = isCurrentMonth || isPastMonth;

  // Group city tours by employee
  const toursByEmployee = new Map<string, CityTourWithCity[]>();
  for (const row of (cityTours ?? []) as CityTourWithCity[]) {
    const list = toursByEmployee.get(row.employee_id) ?? [];
    list.push(row);
    toursByEmployee.set(row.employee_id, list);
  }

  // Index targets & actuals by employee_id for O(1) lookups
  const targetsByEmployee = new Map(
    (targets ?? []).map((t) => [t.employee_id, t])
  );
  const actualsByEmployee = new Map(
    (actuals ?? []).map((a) => [a.employee_id, a])
  );

  /* ── Calendar-driven cumulative rollup ────────────────────────────────
   *
   * We do NOT sum over whichever daily_metrics rows happen to exist —
   * that's exactly what produced the sparse-data bug. Instead we build
   * a calendar-day array from day 1 → end-of-range and walk it per
   * employee, resolving each elapsed working day to either:
   *
   *   row present   → add daily_metrics.target_* / actual_*
   *   row missing   → add the designated-plan fill for target, 0 for actual
   *
   * Plan fill precedence (strongest to weakest):
   *   1. monthly_targets.daily_target_{calls,total_meetings} — explicitly
   *      set by the "Set Targets" bulk dialog.
   *   2. MAX of per-day daily_metrics.target_{calls,total_meetings} for
   *      this employee in the month — the "inferred plan" used when the
   *      user typed per-day targets into the Daily Logs grid without
   *      running Bulk Set. This is what unblocks the "1 row only"
   *      scenario: one manual entry of 10 tells us the daily rate is 10,
   *      so every other elapsed working day fills in 10 too.
   *   3. 0 — no target info anywhere.
   *
   * Actuals never infer — a missing row on a past/today working day is
   * a true "not logged" = 0 contribution.
   * ─────────────────────────────────────────────────────────────────── */
  const mtdCallTargets: Record<string, number> = {};
  const mtdMeetingTargets: Record<string, number> = {};
  const mtdCallActuals: Record<string, number> = {};
  const mtdArchitectActuals: Record<string, number> = {};
  const mtdClientActuals: Record<string, number> = {};
  const mtdSiteVisitActuals: Record<string, number> = {};

  if (shouldRecompute) {
    const pad = (n: number) => String(n).padStart(2, "0");
    const firstOfMonthISO = `${year}-${pad(month)}-01`;
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    // Current month stops at today; past month runs through its last day.
    const upperBoundDay = isCurrentMonth ? now.getDate() : lastDayOfMonth;
    const upperBoundISO = `${year}-${pad(month)}-${pad(upperBoundDay)}`;

    // 1 ── Build the calendar ONCE. This is the source of truth for the
    //      outer loop: we iterate calendar days, not daily_metrics rows.
    type CalDay = { iso: string; weekday: number };
    const calendar: CalDay[] = [];
    for (let d = 1; d <= upperBoundDay; d++) {
      const dt = new Date(year, month - 1, d);
      calendar.push({
        iso: `${year}-${pad(month)}-${pad(d)}`,
        weekday: dt.getDay(),
      });
    }

    // 2 ── Fetch every daily_metrics row in the range (may be sparse).
    const { data: dailyRows } = await supabase
      .from("daily_metrics")
      .select(
        "employee_id, date, target_calls, target_total_meetings, actual_calls, actual_architect_meetings, actual_client_meetings, actual_site_visits"
      )
      .gte("date", firstOfMonthISO)
      .lte("date", upperBoundISO);

    // 3 ── Index rows by (employee → ISO date) for O(1) per-day lookup.
    type DailyRow = NonNullable<typeof dailyRows>[number];
    const dailyByEmp = new Map<string, Map<string, DailyRow>>();
    for (const row of dailyRows ?? []) {
      let byDate = dailyByEmp.get(row.employee_id);
      if (!byDate) {
        byDate = new Map();
        dailyByEmp.set(row.employee_id, byDate);
      }
      byDate.set(row.date, row);
    }

    // 4 ── Walk the calendar once per employee, accumulating.
    for (const emp of employees) {
      const plan = targetsByEmployee.get(emp.id);
      const workingWeekdays = new Set<number>(
        plan?.working_weekdays?.length
          ? plan.working_weekdays
          : [1, 2, 3, 4, 5]
      );

      const empRows = dailyByEmp.get(emp.id);

      // Inference: if the explicit plan fields are 0, derive the daily
      // rate from the largest per-day target we actually see in the
      // month. Covers users who skip the Bulk Set dialog and type targets
      // one day at a time in the Daily Logs grid.
      let inferredCallsPlan = 0;
      let inferredMeetingsPlan = 0;
      if (empRows) {
        for (const r of empRows.values()) {
          if (r.target_calls > inferredCallsPlan) {
            inferredCallsPlan = r.target_calls;
          }
          if (r.target_total_meetings > inferredMeetingsPlan) {
            inferredMeetingsPlan = r.target_total_meetings;
          }
        }
      }

      const planCalls = plan?.daily_target_calls ?? 0;
      const planMeetings = plan?.daily_target_total_meetings ?? 0;
      const sparseCallsFill = planCalls > 0 ? planCalls : inferredCallsPlan;
      const sparseMeetingsFill =
        planMeetings > 0 ? planMeetings : inferredMeetingsPlan;

      let tCalls = 0;
      let tMeetings = 0;
      let aCalls = 0;
      let aArchitect = 0;
      let aClient = 0;
      let aSite = 0;

      for (const day of calendar) {
        if (!workingWeekdays.has(day.weekday)) continue;

        const row = empRows?.get(day.iso);
        if (row) {
          // Row present → pick up its targets + actuals directly.
          tCalls += row.target_calls;
          tMeetings += row.target_total_meetings;
          aCalls += row.actual_calls;
          aArchitect += row.actual_architect_meetings;
          aClient += row.actual_client_meetings;
          aSite += row.actual_site_visits;
        } else {
          // Row missing on an elapsed working day → fill target from
          // plan (or inferred plan); actual stays 0 (not logged).
          tCalls += sparseCallsFill;
          tMeetings += sparseMeetingsFill;
        }
      }

      mtdCallTargets[emp.id] = tCalls;
      mtdMeetingTargets[emp.id] = tMeetings;
      mtdCallActuals[emp.id] = aCalls;
      mtdArchitectActuals[emp.id] = aArchitect;
      mtdClientActuals[emp.id] = aClient;
      mtdSiteVisitActuals[emp.id] = aSite;
    }
  }

  // Merge employees with their target/actual/city tour data. For any
  // month we recomputed, swap the trigger-maintained rollup fields for
  // our calendar-aware values so the table renders the right numbers.
  const data: EmployeeMonthlyData[] = employees.map((emp) => {
    const target = targetsByEmployee.get(emp.id) ?? null;
    const actual = actualsByEmployee.get(emp.id) ?? null;
    const tours = toursByEmployee.get(emp.id) ?? [];

    if (shouldRecompute && target) {
      return {
        employee: emp,
        target: {
          ...target,
          target_total_calls: mtdCallTargets[emp.id] ?? 0,
          target_total_meetings: mtdMeetingTargets[emp.id] ?? 0,
        },
        actual: actual
          ? {
              ...actual,
              actual_calls: mtdCallActuals[emp.id] ?? 0,
              actual_architect_meetings: mtdArchitectActuals[emp.id] ?? 0,
              actual_client_meetings: mtdClientActuals[emp.id] ?? 0,
              actual_site_visits: mtdSiteVisitActuals[emp.id] ?? 0,
            }
          : null,
        cityTours: tours,
      };
    }

    return { employee: emp, target, actual, cityTours: tours };
  });

  return (
    <PerformanceGrid
      data={data}
      userRole={userRole}
      month={month}
      year={year}
      isCurrentMonth={isCurrentMonth}
      cities={cities ?? []}
    />
  );
}
