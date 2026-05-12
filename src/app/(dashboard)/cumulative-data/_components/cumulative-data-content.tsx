import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { EmployeeCumulativeData } from "@/lib/types";
import { getAuthUser } from "@/lib/queries/auth";
import { getEmployeesForUser } from "@/lib/queries/employees";
import { CumulativeGrid } from "./cumulative-grid";

type Props = {
  fromMonth: number;
  fromYear: number;
  toMonth: number;
  toYear: number;
  query: string;
};

/* ── Pagination helper ─────────────────────────────────────────────────────
 *
 * Same trick as monthly-data-content.tsx: PostgREST has a server-side
 * `max-rows` cap (Supabase Cloud historically defaults to 1000), so any
 * query that *might* exceed that cap silently truncates if we don't
 * paginate. For Cumulative Data the math is louder than for Monthly:
 *
 *   monthly_targets / monthly_actuals — N employees × M months. 50 × 12 = 600
 *     rows, under the cap, but at 100 × 12 = 1200 we'd lose data.
 *   monthly_city_tours — N × M × ~3 cities/employee. 50 × 12 × 3 = 1800 rows,
 *     guaranteed truncation on a single-shot read.
 *
 * We page every monthly query, ordered by a deterministic key so .range()'s
 * cutoffs land identically across pages — required by PostgREST to avoid
 * mid-page row dropouts/dupes when results lack a stable sort.
 *
 * The `RangeTable` union restricts callers to the three monthly tables that
 * share the (employee_id, month, year) shape — every other table would
 * sort/filter on different columns. The select expression stays dynamic
 * because each call wants a different projection.
 * ────────────────────────────────────────────────────────────────────────── */
const PAGE_SIZE = 1000;
type RangeTable =
  | "monthly_targets"
  | "monthly_actuals"
  | "monthly_city_tours";

async function fetchAllInRange<Row>(
  supabase: SupabaseClient<Database>,
  table: RangeTable,
  selectExpr: string,
  fromYear: number,
  toYear: number,
): Promise<Row[]> {
  const out: Row[] = [];
  for (let page = 0; ; page++) {
    // We over-fetch by year (boundary-month narrowing happens in JS below)
    // for two reasons: (a) PostgREST .or() chains balloon the URL once the
    // range spans multiple years, and (b) the cost is 11 wasted months max
    // — negligible against the cap math above.
    const { data, error } = await supabase
      .from(table)
      .select(selectExpr)
      .gte("year", fromYear)
      .lte("year", toYear)
      .order("employee_id", { ascending: true })
      .order("year", { ascending: true })
      .order("month", { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) throw error;
    const rows = (data ?? []) as unknown as Row[];
    if (rows.length === 0) break;
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

/** Does a (year, month) pair contribute to the roll-up? Only if its ordinal
 *  sits inside the *present-day-capped* window [fromOrd, maxOrd]. `maxOrd` is
 *  never the raw user-selected `to` — see the cap computed in
 *  CumulativeDataContent below — so a row dated next month is silently
 *  ignored even when the filter's `To` runs into the future. Branchless, no
 *  DST surprises. */
function inWindow(m: number, y: number, fromOrd: number, maxOrd: number) {
  const ord = y * 12 + m;
  return ord >= fromOrd && ord <= maxOrd;
}

export async function CumulativeDataContent({
  fromMonth,
  fromYear,
  toMonth,
  toYear,
  query,
}: Props) {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  const { supabase, id: userId, role: userRole } = auth;

  /* ── Present-day cap ──────────────────────────────────────────────────────
   *
   * THE BUG THIS FIXES: managers routinely enter targets months ahead, so a
   * range whose `To` boundary runs into the future — e.g. "This Fiscal Year"
   * (Apr → Mar) opened in May — would otherwise sum *twelve* months of targets
   * against *two* months of actuals. The achievement % craters and the monthly
   * average gets divided by a denominator the employee couldn't possibly have
   * reached yet.
   *
   * THE FIX: clamp the effective upper boundary to the current calendar month.
   * Every roll-up below — and `numberOfMonths`, the divisor behind every
   * monthly-average cell — is computed against `cappedToOrd`, never the raw
   * user-selected `to`. Past and current months count; future months never do,
   * regardless of what the URL says.
   *
   * Ordinals (year*12 + month) collapse the comparison to one integer test and
   * sidestep month-wraparound bookkeeping. The cap is *inclusive* of the
   * current month (Apr + May = 2, matching the bug report's arithmetic). */
  const now = new Date();
  const currentOrd = now.getFullYear() * 12 + (now.getMonth() + 1);
  const fromOrd = fromYear * 12 + fromMonth;
  const toOrd = toYear * 12 + toMonth;
  const cappedToOrd = Math.min(toOrd, currentOrd);

  // Entire window in the future ⇒ nothing has elapsed: zero months, zero data.
  // Math.max keeps the divisor non-negative; CumulativeMetricCell already
  // treats 0 months as "no data" instead of dividing by it.
  const numberOfMonths = Math.max(0, cappedToOrd - fromOrd + 1);

  // The bulk fetches over-fetch by *year* and narrow to exact months in JS
  // (see fetchAllInRange). Pull the upper fetch year back to the current year
  // too — no point shipping rows for years that lie entirely in the future.
  const cappedFetchYear = Math.min(toYear, now.getFullYear());

  type TargetRow = {
    employee_id: string;
    month: number;
    year: number;
    target_client_visits: number | null;
    target_dispatched_sqft: number | null;
  };
  type ActualRow = {
    employee_id: string;
    month: number;
    year: number;
    actual_client_visits: number | null;
    actual_dispatched_sqft: number | null;
    total_costing: number | null;
  };
  type TourRow = {
    employee_id: string;
    month: number;
    year: number;
    target_days: number | null;
    actual_days: number | null;
  };

  const [employees, targets, actuals, tours] = await Promise.all([
    getEmployeesForUser(supabase, userId, userRole, {
      activeOnly: true,
      search: query,
    }),
    fetchAllInRange<TargetRow>(
      supabase,
      "monthly_targets",
      "employee_id, month, year, target_client_visits, target_dispatched_sqft",
      fromYear,
      cappedFetchYear,
    ),
    fetchAllInRange<ActualRow>(
      supabase,
      "monthly_actuals",
      "employee_id, month, year, actual_client_visits, actual_dispatched_sqft, total_costing",
      fromYear,
      cappedFetchYear,
    ),
    fetchAllInRange<TourRow>(
      supabase,
      "monthly_city_tours",
      "employee_id, month, year, target_days, actual_days",
      fromYear,
      cappedFetchYear,
    ),
  ]);

  // Empty accumulator per employee — keyed so a missing month is implicit
  // (its contribution is zero, no special-casing needed at sum time).
  const make = (): EmployeeCumulativeData => ({
    // employee is filled in below from the employees array. Set a stub
    // here so the type stays well-formed during accumulation.
    employee: undefined as never,
    numberOfMonths,
    clientVisits: { actual: 0, target: 0 },
    dispatchedSqft: { actual: 0, target: 0 },
    tourDays: { actual: 0, target: 0 },
    totalCosting: 0,
  });

  const acc = new Map<string, EmployeeCumulativeData>();
  for (const emp of employees) acc.set(emp.id, { ...make(), employee: emp });

  /* The three roll-ups below all share the same present-day-capped gate
   * (inWindow): a row whose month hasn't elapsed yet contributes nothing, even
   * if it sits inside the user's selected `To`. We also defensively wrap every
   * numeric read in Number(...) || 0 — same lesson from the MTD pass: PostgREST
   * may serialize NUMERIC/BIGINT columns as strings, and silent string-concat
   * is what produced the "49 vs 90+" symptom on Monthly Data. */

  for (const r of targets) {
    if (!inWindow(r.month, r.year, fromOrd, cappedToOrd)) continue;
    const row = acc.get(r.employee_id);
    if (!row) continue; // employee out of scope (e.g. inactive / not assigned)
    row.clientVisits.target += Number(r.target_client_visits) || 0;
    row.dispatchedSqft.target += Number(r.target_dispatched_sqft) || 0;
  }

  for (const r of actuals) {
    if (!inWindow(r.month, r.year, fromOrd, cappedToOrd)) continue;
    const row = acc.get(r.employee_id);
    if (!row) continue;
    row.clientVisits.actual += Number(r.actual_client_visits) || 0;
    row.dispatchedSqft.actual += Number(r.actual_dispatched_sqft) || 0;
    row.totalCosting += Number(r.total_costing) || 0;
  }

  for (const r of tours) {
    if (!inWindow(r.month, r.year, fromOrd, cappedToOrd)) continue;
    const row = acc.get(r.employee_id);
    if (!row) continue;
    row.tourDays.target += Number(r.target_days) || 0;
    row.tourDays.actual += Number(r.actual_days) || 0;
  }

  // Preserve the employees-array ordering (already filtered/scoped by
  // role and search inside getEmployeesForUser) so the table reads
  // identically to the Monthly Data view.
  const data: EmployeeCumulativeData[] = employees.map(
    (e) => acc.get(e.id) ?? { ...make(), employee: e },
  );

  return (
    <CumulativeGrid
      data={data}
      fromMonth={fromMonth}
      fromYear={fromYear}
      toMonth={toMonth}
      toYear={toYear}
      numberOfMonths={numberOfMonths}
    />
  );
}
