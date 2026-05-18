"use client";

/**
 * Client wrapper for PerformanceGrid — drives data through TWO TanStack
 * Query entries that the container merges in a useMemo:
 *
 *   • EMPLOYEES query, keyed by [query, userId, role] — re-fetches on
 *     search keystroke. Cheap (single employees-table read, modulo the
 *     cascading-search expansion). Cache hits return 0 ms on repeat
 *     searches.
 *   • METRICS query, keyed by [month, year, userId, role] — re-fetches
 *     only on month / year change. Owns the paginated daily_metrics
 *     calendar walk and the targets / actuals / city tours / cities
 *     reads. Stable across every search keystroke.
 *
 * The merge is a per-employee lookup against the metrics maps. Typing
 * "alice" never touches the heavy query, so the user sees:
 *   • cache hit on the search → 0 ms swap, no spinner
 *   • cache miss on the search → 60 % dim + toolbar spinner while ONLY
 *     the employees query is in-flight
 *
 * Surfacing isFetching as the OR of both queries means dim + spinner
 * also covers the month-change case unchanged.
 */

import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { EmployeeMonthlyData, UserRole } from "@/lib/types";
import {
  employeesQueryKey,
  fetchEmployees,
} from "@/lib/queries/employees-query";
import {
  fetchMonthlyMetrics,
  monthlyMetricsQueryKey,
  type MonthlyMetricsParams,
} from "../_lib/fetch-monthly-metrics";
import { PerformanceGrid } from "./performance-grid";

type Props = {
  month: number;
  year: number;
  query: string;
  userId: string;
  userRole: UserRole;
};

export function PerformanceGridContainer({
  month,
  year,
  query,
  userId,
  userRole,
}: Props) {
  // The browser client is a thin wrapper around supabase-js + cookie reader.
  // Memoizing keeps a stable instance across renders so internal pools and
  // listeners don't churn on every re-render.
  const supabase = useMemo(() => createClient(), []);

  const employeesParams = useMemo(
    () => ({ query, userId, userRole }),
    [query, userId, userRole],
  );
  const metricsParams: MonthlyMetricsParams = useMemo(
    () => ({ month, year, userId, userRole }),
    [month, year, userId, userRole],
  );

  const { data: employees, isFetching: isFetchingEmployees } = useQuery({
    queryKey: employeesQueryKey(employeesParams),
    queryFn: () => fetchEmployees(supabase, employeesParams),
    placeholderData: keepPreviousData,
  });

  const { data: metrics, isFetching: isFetchingMetrics } = useQuery({
    queryKey: monthlyMetricsQueryKey(metricsParams),
    queryFn: () => fetchMonthlyMetrics(supabase, metricsParams),
    placeholderData: keepPreviousData,
  });

  // Merge: for each employee in the search-filtered list, build the
  // EmployeeMonthlyData row from the metrics maps. The MTD recompute
  // overrides (current / past month) now come from a single
  // mtdByEmployee map sourced from the get_monthly_mtd SQL function;
  // we no longer walk a calendar in the browser.
  const rows: EmployeeMonthlyData[] = useMemo(() => {
    if (!employees || !metrics) return [];
    const {
      targetsByEmployee,
      actualsByEmployee,
      toursByEmployee,
      mtdByEmployee,
      shouldRecompute,
    } = metrics;

    return employees.map((emp) => {
      const target = targetsByEmployee[emp.id] ?? null;
      const actual = actualsByEmployee[emp.id] ?? null;
      const tours = toursByEmployee[emp.id] ?? [];

      if (shouldRecompute && target) {
        const mtd = mtdByEmployee[emp.id];
        return {
          employee: emp,
          target: {
            ...target,
            target_total_calls: mtd?.mtd_target_calls ?? 0,
            target_total_meetings: mtd?.mtd_target_total_meetings ?? 0,
          },
          actual: actual
            ? {
                ...actual,
                actual_calls: mtd?.mtd_actual_calls ?? 0,
                actual_architect_meetings: mtd?.mtd_actual_architect_meetings ?? 0,
                actual_client_meetings: mtd?.mtd_actual_client_meetings ?? 0,
                actual_site_visits: mtd?.mtd_actual_site_visits ?? 0,
              }
            : null,
          cityTours: tours,
        };
      }

      return { employee: emp, target, actual, cityTours: tours };
    });
  }, [employees, metrics]);

  // One overlay signal — dim + spinner if EITHER query is fetching.
  // Search keystroke (cache miss) → only employees fetches → still
  // dims correctly. Month change → only metrics fetches → still dims.
  // Both at once (e.g. first paint after deep link with search) →
  // single overlay, no double-flash.
  const isFetching = isFetchingEmployees || isFetchingMetrics;

  return (
    <PerformanceGrid
      data={rows}
      cities={metrics?.cities ?? []}
      isCurrentMonth={metrics?.isCurrentMonth ?? false}
      userRole={userRole}
      month={month}
      year={year}
      isFetching={isFetching}
    />
  );
}
