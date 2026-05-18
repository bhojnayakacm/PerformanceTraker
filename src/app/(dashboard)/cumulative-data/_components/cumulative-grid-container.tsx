"use client";

/**
 * Client wrapper for CumulativeGrid — same two-query architecture as
 * PerformanceGridContainer on the Monthly Data page.
 *
 *   • EMPLOYEES query, keyed by [query, userId, role] — re-fetches on
 *     search keystroke. Cache hits on repeat searches return 0 ms.
 *   • METRICS query, keyed by [fromMonth, fromYear, toMonth, toYear,
 *     userId, role] — owns the paginated year-range rollups for
 *     monthly_targets / monthly_actuals / monthly_city_tours. Stable
 *     across every search keystroke.
 *
 * The merge is a per-employee lookup against the metrics totals map.
 * Typing into the search box no longer triggers the heavy year-range
 * paginated reads — only the employees table fetch.
 */

import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { EmployeeCumulativeData, UserRole } from "@/lib/types";
import {
  employeesQueryKey,
  fetchEmployees,
} from "@/lib/queries/employees-query";
import {
  fetchCumulativeMetrics,
  cumulativeMetricsQueryKey,
  type CumulativeMetricsParams,
} from "../_lib/fetch-cumulative-metrics";
import { CumulativeGrid } from "./cumulative-grid";

type Props = {
  fromMonth: number;
  fromYear: number;
  toMonth: number;
  toYear: number;
  query: string;
  userId: string;
  userRole: UserRole;
};

export function CumulativeGridContainer({
  fromMonth,
  fromYear,
  toMonth,
  toYear,
  query,
  userId,
  userRole,
}: Props) {
  const supabase = useMemo(() => createClient(), []);

  const employeesParams = useMemo(
    () => ({ query, userId, userRole }),
    [query, userId, userRole],
  );
  const metricsParams: CumulativeMetricsParams = useMemo(
    () => ({ fromMonth, fromYear, toMonth, toYear, userId, userRole }),
    [fromMonth, fromYear, toMonth, toYear, userId, userRole],
  );

  const { data: employees, isFetching: isFetchingEmployees } = useQuery({
    queryKey: employeesQueryKey(employeesParams),
    queryFn: () => fetchEmployees(supabase, employeesParams),
    placeholderData: keepPreviousData,
  });

  const { data: metrics, isFetching: isFetchingMetrics } = useQuery({
    queryKey: cumulativeMetricsQueryKey(metricsParams),
    queryFn: () => fetchCumulativeMetrics(supabase, metricsParams),
    placeholderData: keepPreviousData,
  });

  // Merge: build one EmployeeCumulativeData per search-filtered employee
  // from the precomputed totals map. Employees with no metric rows in
  // the range get zero-initialised entries so the grid renders them
  // consistently (rather than dropping them).
  const rows: EmployeeCumulativeData[] = useMemo(() => {
    if (!employees || !metrics) return [];
    const { totalsByEmployee, numberOfMonths } = metrics;
    return employees.map((emp) => {
      const t = totalsByEmployee[emp.id];
      return {
        employee: emp,
        numberOfMonths,
        clientVisits: {
          actual: t?.clientVisitsActual ?? 0,
          target: t?.clientVisitsTarget ?? 0,
        },
        dispatchedSqft: {
          actual: t?.dispatchedSqftActual ?? 0,
          target: t?.dispatchedSqftTarget ?? 0,
        },
        tourDays: {
          actual: t?.tourDaysActual ?? 0,
          target: t?.tourDaysTarget ?? 0,
        },
        totalCosting: t?.totalCosting ?? 0,
      };
    });
  }, [employees, metrics]);

  const isFetching = isFetchingEmployees || isFetchingMetrics;

  return (
    <CumulativeGrid
      data={rows}
      fromMonth={fromMonth}
      fromYear={fromYear}
      toMonth={toMonth}
      toYear={toYear}
      numberOfMonths={metrics?.numberOfMonths ?? 0}
      isFetching={isFetching}
    />
  );
}
