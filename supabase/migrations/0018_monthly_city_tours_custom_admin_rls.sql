-- ============================================================================
-- 0018_monthly_city_tours_custom_admin_rls.sql
--
-- Two fixes, one migration:
--
--   (A) Bug fix. Migration 0015 (manager → custom_admin rename) repointed the
--       write policies on daily_metrics, monthly_targets, and monthly_actuals,
--       but skipped monthly_city_tours. Its INSERT/UPDATE/DELETE policies
--       still encode the role string 'manager', which the 0015 CHECK
--       constraint no longer accepts as a valid role. Every custom_admin
--       write therefore fails the role check and surfaces to the client as:
--         new row violates row-level security policy for table
--         "monthly_city_tours"
--       This is the user-visible bug — Super Admins worked, Custom Admins
--       didn't.
--
--   (B) Hardening. While we're in here, tighten custom_admin's reach to
--       match the 2-tier hierarchy: a custom_admin can only write rows whose
--       employee_id belongs to their roster in manager_assignments. That
--       mirrors the assertManagerEmployeeAccess check the application
--       already runs in saveMonthlyData, so the DB and the app now agree —
--       a stale client or direct PostgREST call can't smuggle a write past
--       the app-layer gate.
--
-- super_admin remains unscoped (full reach by design). editor remains
-- unscoped to match sibling tables (editors edit actuals across all
-- employees today; restricting that is a separate decision). Only
-- custom_admin is row-level scoped, because that's the role this migration
-- exists to constrain.
-- ============================================================================


-- ── INSERT ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "monthly_city_tours_insert" ON public.monthly_city_tours;
CREATE POLICY "monthly_city_tours_insert"
  ON public.monthly_city_tours FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_role() IN ('super_admin', 'editor')
    OR (
      public.get_user_role() = 'custom_admin'
      AND employee_id IN (
        SELECT employee_id
        FROM public.manager_assignments
        WHERE manager_id = auth.uid()
      )
    )
  );


-- ── UPDATE ──────────────────────────────────────────────────────────────────
-- USING gates which rows the caller can see/touch; WITH CHECK gates the state
-- the row may be left in. The dialog never mutates employee_id (it's pinned
-- by the caller's saveMonthlyData input), so USING = WITH CHECK is the right
-- symmetry: a custom_admin can edit a tour iff they could insert it.
DROP POLICY IF EXISTS "monthly_city_tours_update" ON public.monthly_city_tours;
CREATE POLICY "monthly_city_tours_update"
  ON public.monthly_city_tours FOR UPDATE
  TO authenticated
  USING (
    public.get_user_role() IN ('super_admin', 'editor')
    OR (
      public.get_user_role() = 'custom_admin'
      AND employee_id IN (
        SELECT employee_id
        FROM public.manager_assignments
        WHERE manager_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    public.get_user_role() IN ('super_admin', 'editor')
    OR (
      public.get_user_role() = 'custom_admin'
      AND employee_id IN (
        SELECT employee_id
        FROM public.manager_assignments
        WHERE manager_id = auth.uid()
      )
    )
  );


-- ── DELETE ──────────────────────────────────────────────────────────────────
-- The new diff-pattern in saveMonthlyData (DELETE NOT IN + UPSERT) relies on
-- this policy: when a Custom Admin removes a city card, the resulting DELETE
-- statement must pass RLS for every orphan row matching their roster.
DROP POLICY IF EXISTS "monthly_city_tours_delete" ON public.monthly_city_tours;
CREATE POLICY "monthly_city_tours_delete"
  ON public.monthly_city_tours FOR DELETE
  TO authenticated
  USING (
    public.get_user_role() IN ('super_admin', 'editor')
    OR (
      public.get_user_role() = 'custom_admin'
      AND employee_id IN (
        SELECT employee_id
        FROM public.manager_assignments
        WHERE manager_id = auth.uid()
      )
    )
  );


-- SELECT remains unchanged from 0008 (open to all authenticated). It never
-- referenced 'manager' and read scope is a separate decision.


COMMENT ON POLICY "monthly_city_tours_insert" ON public.monthly_city_tours IS
  'super_admin + editor unscoped; custom_admin scoped to manager_assignments roster. See 0018.';
COMMENT ON POLICY "monthly_city_tours_update" ON public.monthly_city_tours IS
  'super_admin + editor unscoped; custom_admin scoped to manager_assignments roster. See 0018.';
COMMENT ON POLICY "monthly_city_tours_delete" ON public.monthly_city_tours IS
  'super_admin + editor unscoped; custom_admin scoped to manager_assignments roster. See 0018.';


-- ── Reference sanity-checks (run manually if reverifying) ──────────────────
--   SET LOCAL ROLE authenticated;
--   -- impersonate a custom_admin with an assigned employee:
--   SELECT public.get_user_role();          -- expects 'custom_admin'
--   INSERT INTO public.monthly_city_tours (employee_id, month, year, city_id, target_days, actual_days)
--   VALUES ('<assigned-emp-uuid>', 4, 2026, '<city-uuid>', 0.5, 0);  -- passes
--   INSERT INTO public.monthly_city_tours (employee_id, month, year, city_id, target_days, actual_days)
--   VALUES ('<unassigned-emp-uuid>', 4, 2026, '<city-uuid>', 0.5, 0);  -- fails WITH CHECK
