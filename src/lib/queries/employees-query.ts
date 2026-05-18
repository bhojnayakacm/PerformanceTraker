/**
 * TanStack Query wrapper around getEmployeesForUser.
 *
 * The dashboard's role-scoped employees fetch is the one server call that
 * varies with the user's search input. Keying it independently of the
 * heavy metrics queries (monthly_targets / monthly_actuals /
 * daily_metrics / monthly_city_tours) means a search keystroke triggers
 * AT MOST a single employees-table read — never the paginated calendar
 * walk, never the year-range rollups. And because TanStack Query keys
 * are structurally compared, "alice" → clear → "alice" is a 0ms cache
 * hit on the second occurrence.
 *
 * Used by both Monthly Data and Cumulative Data. Daily Logs filters its
 * employee list client-side (via filterEmployeesWithReports) so it does
 * not consume this hook — the daily-logs payload bundles employees
 * alongside one day's metrics in a single query.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { Employee, UserRole } from "@/lib/types";
import { getEmployeesForUser } from "./employees";

export type EmployeesQueryParams = {
  query: string;
  userId: string;
  userRole: UserRole;
};

/**
 * Stable query key for the search-keyed employees fetch.
 *
 * `query` is trimmed at the key boundary — "alice" and "alice " (with a
 * trailing space the user often hits when committing a search) must
 * collapse to the same cache entry, otherwise rapid typing-and-deleting
 * would generate orphan entries that never get reused.
 *
 * userId + role disambiguate the cache across users on the same browser
 * (custom_admin's scoped roster vs. super_admin's full roster) — same
 * rationale as the rest of the query-key designs in this codebase.
 */
export function employeesQueryKey(params: EmployeesQueryParams) {
  return [
    "employees",
    {
      query: params.query.trim(),
      userId: params.userId,
      role: params.userRole,
    },
  ] as const;
}

export async function fetchEmployees(
  supabase: SupabaseClient<Database>,
  { query, userId, userRole }: EmployeesQueryParams,
): Promise<Employee[]> {
  return getEmployeesForUser(supabase, userId, userRole, {
    activeOnly: true,
    search: query.trim(),
  });
}
