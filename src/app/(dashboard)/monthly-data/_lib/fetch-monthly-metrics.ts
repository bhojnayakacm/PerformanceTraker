/**
 * Monthly Data — search-independent metrics fetch.
 *
 * Phase 5 (the daily_metrics elimination): the heavy paginated
 * daily_metrics calendar walk that this file used to do in JavaScript
 * is gone. The same MTD logic — calendar walk over working_weekdays,
 * sparse-fill from the designated plan or inferred rate, current-month
 * cap at today — now lives inside the `get_monthly_mtd(month, year)`
 * SQL function added in migration 0019. We invoke it with a single
 * `.rpc()` call.
 *
 * Wire savings: ~N*D rows of daily_metrics → ~N rows of pre-summed
 * MTD totals. For a 100-employee tenant on a 30-day month, that's ~3000
 * rows shrunk to ~100, and the calendar walk happens once on the
 * server instead of every client refresh.
 *
 * The fetch is still keyed by (month, year, userId, role) — userId and
 * role disambiguate the cache across users on the same browser even
 * though the RPC result itself is RLS-permissive (matching the rest
 * of this file's keying convention).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type {
  CityTourWithCity,
  City,
  MonthlyTarget,
  MonthlyActual,
  UserRole,
} from "@/lib/types";

export type MonthlyMetricsParams = {
  month: number;
  year: number;
  userId: string;
  userRole: UserRole;
};

/** Per-employee MTD aggregate returned by `get_monthly_mtd`. The
 *  Postgres function returns INT for every numeric column, so these
 *  are plain numbers — no string coercion needed on the client. */
export type MtdRow = {
  mtd_target_calls: number;
  mtd_target_total_meetings: number;
  mtd_actual_calls: number;
  mtd_actual_architect_meetings: number;
  mtd_actual_client_meetings: number;
  mtd_actual_site_visits: number;
};

/** Container merges by employee_id. Single map vs. the six parallel
 *  maps we used to ship — fewer destructuring sites in the consumer. */
export type MonthlyMetricsPayload = {
  targetsByEmployee: Record<string, MonthlyTarget>;
  actualsByEmployee: Record<string, MonthlyActual>;
  toursByEmployee: Record<string, CityTourWithCity[]>;
  /** Per-employee MTD overrides. Present only when shouldRecompute is
   *  true; the container applies these on top of the trigger-maintained
   *  target_total_* / actual_* columns from monthly_targets /
   *  monthly_actuals. */
  mtdByEmployee: Record<string, MtdRow>;
  shouldRecompute: boolean;
  cities: City[];
  isCurrentMonth: boolean;
};

export function monthlyMetricsQueryKey(params: MonthlyMetricsParams) {
  return [
    "monthly-metrics",
    {
      month: params.month,
      year: params.year,
      userId: params.userId,
      role: params.userRole,
    },
  ] as const;
}

export async function fetchMonthlyMetrics(
  supabase: SupabaseClient<Database>,
  { month, year }: MonthlyMetricsParams,
): Promise<MonthlyMetricsPayload> {
  const now = new Date();
  const isCurrentMonth =
    month === now.getMonth() + 1 && year === now.getFullYear();
  const isPastMonth =
    year < now.getFullYear() ||
    (year === now.getFullYear() && month < now.getMonth() + 1);
  const shouldRecompute = isCurrentMonth || isPastMonth;

  // Five parallel reads. The MTD RPC is conditional — for future months
  // we don't need it (the calendar walk would return an empty window
  // anyway) and skipping it saves a round-trip. For non-recompute
  // months the consumer falls back to the trigger-maintained
  // monthly_targets.target_total_* columns directly.
  const [
    { data: targets },
    { data: actuals },
    { data: cityTours },
    { data: cities },
    mtdRes,
  ] = await Promise.all([
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
    shouldRecompute
      ? supabase.rpc("get_monthly_mtd", { _month: month, _year: year })
      : Promise.resolve({ data: null, error: null } as const),
  ]);

  if (mtdRes.error) throw mtdRes.error;

  const toursByEmployee: Record<string, CityTourWithCity[]> = {};
  for (const row of (cityTours ?? []) as CityTourWithCity[]) {
    const list = toursByEmployee[row.employee_id] ?? [];
    list.push(row);
    toursByEmployee[row.employee_id] = list;
  }

  const targetsByEmployee: Record<string, MonthlyTarget> = {};
  for (const t of targets ?? []) targetsByEmployee[t.employee_id] = t;

  const actualsByEmployee: Record<string, MonthlyActual> = {};
  for (const a of actuals ?? []) actualsByEmployee[a.employee_id] = a;

  const mtdByEmployee: Record<string, MtdRow> = {};
  for (const row of mtdRes.data ?? []) {
    mtdByEmployee[row.employee_id] = {
      mtd_target_calls: row.mtd_target_calls,
      mtd_target_total_meetings: row.mtd_target_total_meetings,
      mtd_actual_calls: row.mtd_actual_calls,
      mtd_actual_architect_meetings: row.mtd_actual_architect_meetings,
      mtd_actual_client_meetings: row.mtd_actual_client_meetings,
      mtd_actual_site_visits: row.mtd_actual_site_visits,
    };
  }

  return {
    targetsByEmployee,
    actualsByEmployee,
    toursByEmployee,
    mtdByEmployee,
    shouldRecompute,
    cities: cities ?? [],
    isCurrentMonth,
  };
}
