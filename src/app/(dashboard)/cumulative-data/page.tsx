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
  fetchCumulativeMetrics,
  cumulativeMetricsQueryKey,
} from "./_lib/fetch-cumulative-metrics";
import { CumulativeGridContainer } from "./_components/cumulative-grid-container";
import { CumulativeDataSkeleton } from "./_components/cumulative-data-skeleton";

/** Default range: the current Indian fiscal year (Apr → Mar). When the
 *  user lands on the page without URL params we want a meaningful YTD
 *  view rather than an empty single month. */
function defaultFY(now: Date) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const fyStart = m >= 4 ? y : y - 1;
  return {
    fromMonth: 4,
    fromYear: fyStart,
    toMonth: 3,
    toYear: fyStart + 1,
  };
}

function parseRange(params: {
  fromMonth?: string;
  fromYear?: string;
  toMonth?: string;
  toYear?: string;
}) {
  const def = defaultFY(new Date());

  const safe = (raw: string | undefined, fallback: number, lo: number, hi: number) => {
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n >= lo && n <= hi ? n : fallback;
  };

  const fromMonth = safe(params.fromMonth, def.fromMonth, 1, 12);
  const fromYear = safe(params.fromYear, def.fromYear, 2000, 2100);
  const toMonth = safe(params.toMonth, def.toMonth, 1, 12);
  const toYear = safe(params.toYear, def.toYear, 2000, 2100);

  const fromOrd = fromYear * 12 + fromMonth;
  const toOrd = toYear * 12 + toMonth;
  if (toOrd < fromOrd) return def;
  return { fromMonth, fromYear, toMonth, toYear };
}

export default async function CumulativeDataPage({
  searchParams,
}: {
  searchParams: Promise<{
    fromMonth?: string;
    fromYear?: string;
    toMonth?: string;
    toYear?: string;
    query?: string;
  }>;
}) {
  const params = await searchParams;
  const { fromMonth, fromYear, toMonth, toYear } = parseRange(params);
  const query = params.query?.trim() ?? "";

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Cumulative Data</h1>
        <p className="text-muted-foreground mt-1">
          Aggregate performance across a custom month range — totals and
          monthly averages per employee.
        </p>
      </div>

      {/* No `key` on Suspense — filter changes must NOT unmount the table,
       *  otherwise `placeholderData: keepPreviousData` has nothing to fall
       *  back to and the user sees a fresh skeleton on every interaction. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <Suspense fallback={<CumulativeDataSkeleton />}>
          <CumulativeDataLoader
            fromMonth={fromMonth}
            fromYear={fromYear}
            toMonth={toMonth}
            toYear={toYear}
            query={query}
          />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * Prefetches BOTH the search-keyed employees query AND the
 * (range)-keyed metrics query in parallel — same split as Monthly Data.
 * Search keystrokes refetch only employees; range changes refetch only
 * metrics. Backtracks become 0 ms cache hits.
 */
async function CumulativeDataLoader({
  fromMonth,
  fromYear,
  toMonth,
  toYear,
  query,
}: {
  fromMonth: number;
  fromYear: number;
  toMonth: number;
  toYear: number;
  query: string;
}) {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  const employeesParams = { query, userId: auth.id, userRole: auth.role };
  const metricsParams = {
    fromMonth,
    fromYear,
    toMonth,
    toYear,
    userId: auth.id,
    userRole: auth.role,
  };

  const queryClient = getQueryClient();
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: employeesQueryKey(employeesParams),
      queryFn: () => fetchEmployees(auth.supabase, employeesParams),
    }),
    queryClient.prefetchQuery({
      queryKey: cumulativeMetricsQueryKey(metricsParams),
      queryFn: () => fetchCumulativeMetrics(auth.supabase, metricsParams),
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CumulativeGridContainer
        fromMonth={fromMonth}
        fromYear={fromYear}
        toMonth={toMonth}
        toYear={toYear}
        query={query}
        userId={auth.id}
        userRole={auth.role}
      />
    </HydrationBoundary>
  );
}
