import { Suspense } from "react";
import { redirect } from "next/navigation";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getAuthUser } from "@/lib/queries/auth";
import { getQueryClient } from "@/lib/query-client";
import {
  employeesQueryKey,
  fetchEmployees,
} from "@/lib/queries/employees-query";
import {
  fetchMonthlyMetrics,
  monthlyMetricsQueryKey,
} from "./_lib/fetch-monthly-metrics";
import { PerformanceGridContainer } from "./_components/performance-grid-container";
import { MonthlyDataTableSkeleton } from "./_components/monthly-data-skeleton";

export default async function MonthlyDataPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    year?: string;
    query?: string;
  }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const month = params.month ? parseInt(params.month) : now.getMonth() + 1;
  const year = params.year ? parseInt(params.year) : now.getFullYear();
  const query = params.query?.trim() ?? "";

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Monthly Data</h1>
        <p className="text-muted-foreground mt-1">
          Track monthly targets and actuals for all employees.
        </p>
      </div>

      {/* Suspense streams the header above immediately while the prefetch
       *  resolves below. The Suspense boundary deliberately has NO `key`:
       *  filter changes (month/year/query) must NOT unmount the table tree
       *  — that would defeat `placeholderData: keepPreviousData` and flash
       *  a skeleton on every interaction. The fallback only ever fires on
       *  cold mount (first load, hard refresh, deep link). */}
      <div className="flex min-h-0 flex-1 flex-col">
        <Suspense fallback={<MonthlyDataTableSkeleton />}>
          <MonthlyDataLoader month={month} year={year} query={query} />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * Server-side prefetch + HydrationBoundary.
 *
 * Prefetches BOTH the search-keyed employees query AND the
 * (month, year)-keyed metrics query in parallel. The two cache entries
 * hydrate together on the client so the container's first render is a
 * synchronous double cache hit — no second round-trip, no skeleton.
 *
 * On subsequent filter changes only the affected entry refetches: a
 * search keystroke fires the cheap employees fetch; a month/year change
 * fires the heavy metrics fetch. Both are independently cached, so
 * common patterns like "search alice → clear → search alice" or
 * "May → June → May" become 0 ms cache hits.
 */
async function MonthlyDataLoader({
  month,
  year,
  query,
}: {
  month: number;
  year: number;
  query: string;
}) {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  const employeesParams = { query, userId: auth.id, userRole: auth.role };
  const metricsParams = { month, year, userId: auth.id, userRole: auth.role };

  const queryClient = getQueryClient();
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: employeesQueryKey(employeesParams),
      queryFn: () => fetchEmployees(auth.supabase, employeesParams),
    }),
    queryClient.prefetchQuery({
      queryKey: monthlyMetricsQueryKey(metricsParams),
      queryFn: () => fetchMonthlyMetrics(auth.supabase, metricsParams),
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PerformanceGridContainer
        month={month}
        year={year}
        query={query}
        userId={auth.id}
        userRole={auth.role}
      />
    </HydrationBoundary>
  );
}
