/**
 * Cumulative Data — search-independent metrics fetch.
 *
 * Mirrors fetch-monthly-metrics.ts. Splits the heavy paginated range
 * fetches out of the old single-shot fetch-cumulative-data so a search
 * keystroke can never trigger them. The container layers this on top
 * of a separate, search-keyed employees query and merges in a useMemo.
 *
 * The present-day cap (clamping `to` to the current calendar month)
 * stays here, not in the calling page — server prefetch and client
 * refetch must agree on the same window, otherwise HydrationBoundary
 * would seed a cache entry the client immediately invalidates.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { UserRole } from "@/lib/types";

export type CumulativeMetricsParams = {
  fromMonth: number;
  fromYear: number;
  toMonth: number;
  toYear: number;
  userId: string;
  userRole: UserRole;
};

/** Per-employee accumulated totals over the (present-day-capped) range.
 *  Keyed by employee_id so the container can merge against whichever
 *  search-filtered subset the user is currently viewing. */
export type CumulativeMetricsPayload = {
  totalsByEmployee: Record<
    string,
    {
      clientVisitsTarget: number;
      clientVisitsActual: number;
      dispatchedSqftTarget: number;
      dispatchedSqftActual: number;
      tourDaysTarget: number;
      tourDaysActual: number;
      totalCosting: number;
    }
  >;
  numberOfMonths: number;
};

export function cumulativeMetricsQueryKey(params: CumulativeMetricsParams) {
  return [
    "cumulative-metrics",
    {
      fromMonth: params.fromMonth,
      fromYear: params.fromYear,
      toMonth: params.toMonth,
      toYear: params.toYear,
      userId: params.userId,
      role: params.userRole,
    },
  ] as const;
}

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
    // Over-fetch by year (narrow to exact months in JS below) — keeps
    // the URL short across multi-year ranges and the wasted-row count
    // bounded (≤11 months across an entire year fetch).
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

function inWindow(m: number, y: number, fromOrd: number, maxOrd: number) {
  const ord = y * 12 + m;
  return ord >= fromOrd && ord <= maxOrd;
}

export async function fetchCumulativeMetrics(
  supabase: SupabaseClient<Database>,
  {
    fromMonth,
    fromYear,
    toMonth,
    toYear,
  }: CumulativeMetricsParams,
): Promise<CumulativeMetricsPayload> {
  /* Present-day cap. Managers routinely enter targets months ahead, so a
   * range whose `to` runs into the future — e.g. "This Fiscal Year" opened
   * in May — would otherwise sum 12 months of targets against 2 months of
   * actuals. Clamp to the current calendar month; every roll-up and the
   * monthly-average divisor uses the capped boundary. */
  const now = new Date();
  const currentOrd = now.getFullYear() * 12 + (now.getMonth() + 1);
  const fromOrd = fromYear * 12 + fromMonth;
  const toOrd = toYear * 12 + toMonth;
  const cappedToOrd = Math.min(toOrd, currentOrd);

  const numberOfMonths = Math.max(0, cappedToOrd - fromOrd + 1);

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

  // No employee filter — over-fetches across the whole accessible set
  // for the user's role (RLS keeps custom_admin's view bounded). The
  // container picks out whichever subset matches the current search,
  // and this cache entry stays valid across every search keystroke.
  const [targets, actuals, tours] = await Promise.all([
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

  const totalsByEmployee: CumulativeMetricsPayload["totalsByEmployee"] = {};
  const getOrInit = (empId: string) => {
    let row = totalsByEmployee[empId];
    if (!row) {
      row = {
        clientVisitsTarget: 0,
        clientVisitsActual: 0,
        dispatchedSqftTarget: 0,
        dispatchedSqftActual: 0,
        tourDaysTarget: 0,
        tourDaysActual: 0,
        totalCosting: 0,
      };
      totalsByEmployee[empId] = row;
    }
    return row;
  };

  for (const r of targets) {
    if (!inWindow(r.month, r.year, fromOrd, cappedToOrd)) continue;
    const row = getOrInit(r.employee_id);
    row.clientVisitsTarget += Number(r.target_client_visits) || 0;
    row.dispatchedSqftTarget += Number(r.target_dispatched_sqft) || 0;
  }

  for (const r of actuals) {
    if (!inWindow(r.month, r.year, fromOrd, cappedToOrd)) continue;
    const row = getOrInit(r.employee_id);
    row.clientVisitsActual += Number(r.actual_client_visits) || 0;
    row.dispatchedSqftActual += Number(r.actual_dispatched_sqft) || 0;
    row.totalCosting += Number(r.total_costing) || 0;
  }

  for (const r of tours) {
    if (!inWindow(r.month, r.year, fromOrd, cappedToOrd)) continue;
    const row = getOrInit(r.employee_id);
    row.tourDaysTarget += Number(r.target_days) || 0;
    row.tourDaysActual += Number(r.actual_days) || 0;
  }

  return { totalsByEmployee, numberOfMonths };
}
