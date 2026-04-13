-- ============================================================================
-- wipe_business_data.sql
-- Resets business data for Bulk Import testing while preserving all users.
--
-- ⚠️  MANUAL USE ONLY — do NOT place this file in supabase/migrations/.
--     Run it explicitly via `supabase db psql` or the Supabase Dashboard
--     SQL editor when you need a clean slate.
--
-- AFFECTED (wiped):
--   public.employees           (parent)
--   public.cities              (parent)
--   public.manager_assignments (cascaded via employees)
--   public.daily_metrics       (cascaded via employees)
--   public.monthly_targets     (cascaded via employees)
--   public.monthly_actuals     (cascaded via employees)
--   public.monthly_city_tours  (cascaded via employees + cities)
--
-- PRESERVED (verified by assertion, script rolls back if touched):
--   public.profiles
--   auth.users
--
-- Why this is safe:
--   TRUNCATE ... CASCADE walks foreign keys PARENT → CHILD only. It never
--   walks CHILD → PARENT, so clearing manager_assignments cannot propagate
--   into profiles, and nothing here references auth.users.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  pre_profiles  BIGINT;
  pre_users     BIGINT;
  post_profiles BIGINT;
  post_users    BIGINT;
BEGIN
  SELECT COUNT(*) INTO pre_profiles FROM public.profiles;
  SELECT COUNT(*) INTO pre_users    FROM auth.users;

  TRUNCATE TABLE
    public.employees,
    public.cities
  RESTART IDENTITY CASCADE;

  SELECT COUNT(*) INTO post_profiles FROM public.profiles;
  SELECT COUNT(*) INTO post_users    FROM auth.users;

  IF post_profiles <> pre_profiles THEN
    RAISE EXCEPTION
      'ABORT: profiles row count changed (% -> %). Rolling back.',
      pre_profiles, post_profiles;
  END IF;

  IF post_users <> pre_users THEN
    RAISE EXCEPTION
      'ABORT: auth.users row count changed (% -> %). Rolling back.',
      pre_users, post_users;
  END IF;

  RAISE NOTICE
    'Wipe OK. profiles=% (unchanged), auth.users=% (unchanged).',
    post_profiles, post_users;
END $$;

COMMIT;

-- Post-wipe verification (optional, run separately):
--   SELECT 'employees'          AS t, COUNT(*) FROM public.employees
--   UNION ALL SELECT 'cities',             COUNT(*) FROM public.cities
--   UNION ALL SELECT 'daily_metrics',      COUNT(*) FROM public.daily_metrics
--   UNION ALL SELECT 'monthly_targets',    COUNT(*) FROM public.monthly_targets
--   UNION ALL SELECT 'monthly_actuals',    COUNT(*) FROM public.monthly_actuals
--   UNION ALL SELECT 'monthly_city_tours', COUNT(*) FROM public.monthly_city_tours
--   UNION ALL SELECT 'manager_assignments',COUNT(*) FROM public.manager_assignments
--   UNION ALL SELECT 'profiles (KEEP)',    COUNT(*) FROM public.profiles
--   UNION ALL SELECT 'auth.users (KEEP)',  COUNT(*) FROM auth.users;
