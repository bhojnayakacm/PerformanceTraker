/**
 * Hover-prefetch dispatcher for sidebar links.
 *
 * Maps a destination pathname to the TanStack Query entries that route's
 * client containers consume — and fires `prefetchQuery` against the
 * browser cache. By the time the user clicks, the data is already there
 * and the page hydrates synchronously.
 *
 * This sits on top of (not in place of) Next.js's `<Link prefetch>` RSC
 * prefetch. The RSC prefetch is what streams `loading.tsx` instantly and
 * carries the page's dehydrated state inside the prefetched payload. The
 * hover prefetch here is a belt-and-suspenders measure: if the RSC
 * payload aged out of Next.js's cache, or the user lingered on the
 * current page long enough for our 30 s staleTime to elapse, a 150 ms
 * hover re-warms the browser cache directly so the navigation is still
 * 0 ms perceived.
 *
 * The query keys must MATCH the keys produced by each page's server
 * prefetch byte-for-byte, otherwise HydrationBoundary would seed an
 * orphan entry and the client would re-fetch on mount. The defaults
 * here (current month for Monthly, current FY for Cumulative, today's
 * date for Daily Logs) mirror the same defaults each `page.tsx` falls
 * back to when its searchParams are absent — the most common entry
 * point from the sidebar.
 */

import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { UserRole } from "@/lib/types";
import { employeesQueryKey, fetchEmployees } from "./employees-query";
import {
  fetchMonthlyMetrics,
  monthlyMetricsQueryKey,
} from "@/app/(dashboard)/monthly-data/_lib/fetch-monthly-metrics";
import {
  fetchCumulativeMetrics,
  cumulativeMetricsQueryKey,
} from "@/app/(dashboard)/cumulative-data/_lib/fetch-cumulative-metrics";
import {
  dailyLogsQueryKey,
  fetchDailyLogs,
} from "@/app/(dashboard)/daily-logs/_lib/fetch-daily-logs";

export type PrefetchCtx = {
  supabase: SupabaseClient<Database>;
  userId: string;
  userRole: UserRole;
};

/** Re-hovers within 30 s are a no-op against this cache — TanStack
 *  Query skips prefetch when the entry is still fresh. Prevents a user
 *  who jiggles the cursor over the sidebar from issuing repeat reads. */
const PREFETCH_STALE_MS = 30_000;

function isoToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultFY() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const fyStart = m >= 4 ? y : y - 1;
  return { fromMonth: 4, fromYear: fyStart, toMonth: 3, toYear: fyStart + 1 };
}

export function prefetchRoute(
  queryClient: QueryClient,
  pathname: string,
  ctx: PrefetchCtx,
): void {
  const { supabase, userId, userRole } = ctx;

  // The default landing for every route below is an empty search.
  // That's the entry users see when they click a sidebar link — so
  // warming `query: ""` is the highest-yield prefetch we can do.
  const employeesParams = { query: "", userId, userRole };

  if (pathname === "/monthly-data") {
    const now = new Date();
    const params = {
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      userId,
      userRole,
    };
    void queryClient.prefetchQuery({
      queryKey: employeesQueryKey(employeesParams),
      queryFn: () => fetchEmployees(supabase, employeesParams),
      staleTime: PREFETCH_STALE_MS,
    });
    void queryClient.prefetchQuery({
      queryKey: monthlyMetricsQueryKey(params),
      queryFn: () => fetchMonthlyMetrics(supabase, params),
      staleTime: PREFETCH_STALE_MS,
    });
    return;
  }

  if (pathname === "/cumulative-data") {
    const params = { ...defaultFY(), userId, userRole };
    void queryClient.prefetchQuery({
      queryKey: employeesQueryKey(employeesParams),
      queryFn: () => fetchEmployees(supabase, employeesParams),
      staleTime: PREFETCH_STALE_MS,
    });
    void queryClient.prefetchQuery({
      queryKey: cumulativeMetricsQueryKey(params),
      queryFn: () => fetchCumulativeMetrics(supabase, params),
      staleTime: PREFETCH_STALE_MS,
    });
    return;
  }

  if (pathname === "/daily-logs") {
    const params = { date: isoToday(), userId, userRole };
    void queryClient.prefetchQuery({
      queryKey: dailyLogsQueryKey(params),
      queryFn: () => fetchDailyLogs(supabase, params),
      staleTime: PREFETCH_STALE_MS,
    });
    return;
  }

  // /, /employees, /users, /import, /reports aren't part of the
  // Phase 1-3 TanStack Query split — Next.js's RSC prefetch already
  // covers them. We deliberately no-op rather than guess at their
  // internal fetch shape.
}
