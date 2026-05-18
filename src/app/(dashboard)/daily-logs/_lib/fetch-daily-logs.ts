/**
 * Daily Logs — shared fetch.
 *
 * One function, two callers. The Server Component (page.tsx) calls it
 * during prefetch with the server Supabase client; the Client Component
 * (DailyLogViewContainer) calls it from `useQuery` with the browser
 * Supabase client on date changes after first paint. Both must produce
 * an identical shape — HydrationBoundary depends on that contract,
 * otherwise the client would re-fetch on mount and the whole point of
 * hydration (zero round-trip on first paint) would collapse.
 *
 * The body is verbatim from the old DailyLogsData RSC; only the
 * auth/redirect wrappers were stripped so it can run unchanged in both
 * environments.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { DailyMetric, Employee, UserRole } from "@/lib/types";
import { getEmployeesForUser } from "@/lib/queries/employees";

export type DailyLogsParams = {
  date: string;
  userId: string;
  userRole: UserRole;
};

export type DailyLogsPayload = {
  employees: Employee[];
  dataMap: Record<string, DailyMetric>;
};

/**
 * Stable query key used by *both* the server-side prefetch and the
 * client-side useQuery. They must match byte-for-byte or HydrationBoundary
 * won't find the dehydrated entry and the client will spin up a second
 * fetch on mount.
 *
 * userId + role are part of the key because getEmployeesForUser scopes the
 * roster (a custom_admin's "May 12" is a strictly smaller set than a
 * super_admin's). Without them, two profiles signing in back-to-back on
 * the same browser would risk seeing each other's cached rows from the
 * module-level singleton QueryClient.
 */
export function dailyLogsQueryKey(params: DailyLogsParams) {
  return [
    "daily-logs",
    {
      date: params.date,
      userId: params.userId,
      role: params.userRole,
    },
  ] as const;
}

export async function fetchDailyLogs(
  supabase: SupabaseClient<Database>,
  { date, userId, userRole }: DailyLogsParams,
): Promise<DailyLogsPayload> {
  const [employees, { data: dailyMetrics }] = await Promise.all([
    getEmployeesForUser(supabase, userId, userRole, { activeOnly: true }),
    supabase.from("daily_metrics").select("*").eq("date", date),
  ]);

  const dataMap: Record<string, DailyMetric> = {};
  for (const row of dailyMetrics ?? []) {
    dataMap[row.employee_id] = row;
  }

  return { employees, dataMap };
}
