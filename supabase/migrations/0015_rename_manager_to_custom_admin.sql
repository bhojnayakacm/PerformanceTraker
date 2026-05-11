-- ============================================================================
-- 0015_rename_manager_to_custom_admin.sql
-- Rename system role 'manager' → 'custom_admin' to free up "manager" terminology
-- for the new employee reporting hierarchy (migration 0016).
-- ============================================================================
-- The role is stored as TEXT with a CHECK constraint (not a Postgres ENUM),
-- so the rename is a single transaction:
--   1) drop the constraint
--   2) UPDATE existing 'manager' rows in profiles
--   3) recreate the constraint with the new vocabulary
--   4) repoint every RLS policy that gates write access by role
--
-- The `manager_assignments` table and its `manager_id` column are intentionally
-- left untouched: they're internal junction-table names, and the verb "manage"
-- (a user with custom_admin role manages assigned employees) survives the
-- terminology change. Renaming them would force a large diff for no behavior
-- change. The new `employees.reporting_manager_id` (next migration) lives on
-- a different table and isn't ambiguous.
-- ============================================================================


-- ── 1. Refresh the role check constraint ─────────────────────────────────────
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

UPDATE public.profiles
SET    role = 'custom_admin'
WHERE  role = 'manager';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'custom_admin', 'editor', 'viewer'));


-- ── 2. Repoint RLS policies (drop-and-recreate for clarity) ─────────────────
-- daily_metrics
DROP POLICY IF EXISTS "daily_metrics_insert" ON public.daily_metrics;
CREATE POLICY "daily_metrics_insert"
  ON public.daily_metrics FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role() IN ('super_admin', 'custom_admin', 'editor'));

DROP POLICY IF EXISTS "daily_metrics_update" ON public.daily_metrics;
CREATE POLICY "daily_metrics_update"
  ON public.daily_metrics FOR UPDATE
  TO authenticated
  USING      (public.get_user_role() IN ('super_admin', 'custom_admin', 'editor'))
  WITH CHECK (public.get_user_role() IN ('super_admin', 'custom_admin', 'editor'));

DROP POLICY IF EXISTS "daily_metrics_delete" ON public.daily_metrics;
CREATE POLICY "daily_metrics_delete"
  ON public.daily_metrics FOR DELETE
  TO authenticated
  USING (public.get_user_role() IN ('super_admin', 'custom_admin', 'editor'));

-- monthly_targets
DROP POLICY IF EXISTS "monthly_targets_insert" ON public.monthly_targets;
CREATE POLICY "monthly_targets_insert"
  ON public.monthly_targets FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role() IN ('super_admin', 'custom_admin'));

DROP POLICY IF EXISTS "monthly_targets_update" ON public.monthly_targets;
CREATE POLICY "monthly_targets_update"
  ON public.monthly_targets FOR UPDATE
  TO authenticated
  USING      (public.get_user_role() IN ('super_admin', 'custom_admin'))
  WITH CHECK (public.get_user_role() IN ('super_admin', 'custom_admin'));

-- monthly_actuals
DROP POLICY IF EXISTS "monthly_actuals_insert" ON public.monthly_actuals;
CREATE POLICY "monthly_actuals_insert"
  ON public.monthly_actuals FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role() IN ('super_admin', 'custom_admin', 'editor'));

DROP POLICY IF EXISTS "monthly_actuals_update" ON public.monthly_actuals;
CREATE POLICY "monthly_actuals_update"
  ON public.monthly_actuals FOR UPDATE
  TO authenticated
  USING      (public.get_user_role() IN ('super_admin', 'custom_admin', 'editor'))
  WITH CHECK (public.get_user_role() IN ('super_admin', 'custom_admin', 'editor'));


-- ============================================================================
-- DONE. Existing 'manager' rows are migrated; constraint and RLS policies now
-- speak 'custom_admin'. Application code must be updated in lockstep with this
-- migration (every `role === "manager"` check needs to become "custom_admin").
-- ============================================================================
