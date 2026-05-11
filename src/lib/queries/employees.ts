import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { Employee } from "@/lib/types";

/**
 * Fetch employees scoped to the user's role.
 * Custom admins see only their assigned employees; everyone else sees all.
 *
 * When a `search` term is supplied the result CASCADES through the reporting
 * hierarchy: direct text matches PLUS every employee whose
 * `reporting_manager_id` points at one of those direct matches. Cascade
 * depth is one — matching the strict 2-tier invariant from migration 0016.
 *
 * The expansion is implemented in two queries rather than a single self-
 * join + OR (which would balloon the URL once the matched-id set grows):
 *
 *   1. Find direct-match IDs (name/emp_id ILIKE).
 *   2. Re-fetch employees whose `id` OR `reporting_manager_id` is in that
 *      set, scoped by role and activeOnly.
 *
 * Step 1 is cheap (we only `select("id")`); step 2 returns the full row.
 *
 * IMPORTANT: keep this in sync with `filterEmployeesWithReports` in
 * `lib/utils.ts` — daily-logs uses the JS version because it filters a
 * pre-fetched list client-side.
 */
export async function getEmployeesForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  role: string,
  {
    activeOnly = false,
    search = "",
  }: { activeOnly?: boolean; search?: string } = {}
): Promise<Employee[]> {
  const trimmedSearch = search.trim();

  if (role === "custom_admin") {
    const { data: assignments } = await supabase
      .from("manager_assignments")
      .select("employee_id")
      .eq("manager_id", userId);

    const assignedIds = (assignments ?? []).map((a) => a.employee_id);
    if (assignedIds.length === 0) return [];

    if (trimmedSearch) {
      const directIds = await fetchDirectMatchIds(
        supabase,
        trimmedSearch,
        assignedIds,
      );
      if (directIds.length === 0) return [];

      // The expanded set must remain inside the custom_admin's scope. The
      // intersection between "direct-or-reports-of-direct" and "assigned to
      // this custom_admin" is enforced by the trailing .in("id", assignedIds).
      let query = supabase
        .from("employees")
        .select("*")
        .in("id", assignedIds)
        .or(
          `id.in.(${directIds.join(",")}),reporting_manager_id.in.(${directIds.join(",")})`,
        )
        .order("name", { ascending: true });

      if (activeOnly) query = query.eq("is_active", true);
      const { data } = await query;
      return data ?? [];
    }

    // No search — straight scope query.
    let query = supabase
      .from("employees")
      .select("*")
      .in("id", assignedIds)
      .order("name", { ascending: true });

    if (activeOnly) query = query.eq("is_active", true);
    const { data } = await query;
    return data ?? [];
  }

  /* ── super_admin / editor / viewer — no per-employee scope, just the
   *    cascading search expansion when a query is present. ── */
  if (trimmedSearch) {
    const directIds = await fetchDirectMatchIds(supabase, trimmedSearch);
    if (directIds.length === 0) return [];

    let query = supabase
      .from("employees")
      .select("*")
      .or(
        `id.in.(${directIds.join(",")}),reporting_manager_id.in.(${directIds.join(",")})`,
      )
      .order("name", { ascending: true });

    if (activeOnly) query = query.eq("is_active", true);
    const { data } = await query;
    return data ?? [];
  }

  let query = supabase
    .from("employees")
    .select("*")
    .order("name", { ascending: true });

  if (activeOnly) query = query.eq("is_active", true);
  const { data } = await query;
  return data ?? [];
}

/**
 * Tiny helper for step 1 of cascading search — return only the IDs of rows
 * whose name OR emp_id matches the term. Callers feed those IDs into a
 * second query that expands to include direct reports.
 *
 * The optional `scopeIds` clamps the search to a custom_admin's assigned
 * employees so the cascade can't leak outside their scope.
 */
async function fetchDirectMatchIds(
  supabase: SupabaseClient<Database>,
  search: string,
  scopeIds?: string[],
): Promise<string[]> {
  let query = supabase
    .from("employees")
    .select("id")
    .or(`name.ilike.%${search}%,emp_id.ilike.%${search}%`);

  if (scopeIds && scopeIds.length > 0) {
    query = query.in("id", scopeIds);
  }

  const { data } = await query;
  return (data ?? []).map((r) => r.id);
}

/**
 * Verify that a custom admin has access to the given employee IDs.
 * Returns true only if ALL IDs are assigned to this user.
 */
export async function assertManagerEmployeeAccess(
  supabase: SupabaseClient<Database>,
  managerId: string,
  employeeIds: string[]
): Promise<boolean> {
  if (employeeIds.length === 0) return true;

  const { data } = await supabase
    .from("manager_assignments")
    .select("employee_id")
    .eq("manager_id", managerId)
    .in("employee_id", employeeIds);

  return (data?.length ?? 0) === employeeIds.length;
}
