-- ============================================================================
-- 0004_combined_meeting_targets.sql
-- Combine individual meeting target columns into a single target_total_meetings
-- ============================================================================
-- Business logic change: Architect Meetings, Client Meetings, and Site Visits
-- now share a single combined daily target. Actuals are still tracked separately.
-- The sync trigger function is updated to use the new column directly.
-- ============================================================================


-- ============================================================================
-- 1. ADD NEW COLUMN
-- ============================================================================
ALTER TABLE public.daily_metrics
  ADD COLUMN target_total_meetings INT NOT NULL DEFAULT 0;


-- ============================================================================
-- 2. MIGRATE EXISTING DATA (sum the 3 old targets into the new column)
-- ============================================================================
UPDATE public.daily_metrics
SET target_total_meetings = target_architect_meetings + target_client_meetings + target_site_visits;


-- ============================================================================
-- 3. DROP OLD TARGET COLUMNS
-- ============================================================================
ALTER TABLE public.daily_metrics DROP COLUMN target_architect_meetings;
ALTER TABLE public.daily_metrics DROP COLUMN target_client_meetings;
ALTER TABLE public.daily_metrics DROP COLUMN target_site_visits;


-- ============================================================================
-- 4. UPDATE SYNC HELPER — Now reads target_total_meetings directly
-- ============================================================================
CREATE OR REPLACE FUNCTION public._sync_monthly_from_daily(
  _employee_id UUID,
  _month       INT,
  _year        INT
) RETURNS VOID AS $$
DECLARE
  _tc  INT;  -- sum target_calls
  _ttm INT;  -- sum target_total_meetings
  _ac  INT;  -- sum actual_calls
  _aam INT;  -- sum actual_architect_meetings
  _acm INT;  -- sum actual_client_meetings
  _asv INT;  -- sum actual_site_visits
BEGIN
  SELECT
    COALESCE(SUM(target_calls), 0),
    COALESCE(SUM(target_total_meetings), 0),
    COALESCE(SUM(actual_calls), 0),
    COALESCE(SUM(actual_architect_meetings), 0),
    COALESCE(SUM(actual_client_meetings), 0),
    COALESCE(SUM(actual_site_visits), 0)
  INTO _tc, _ttm, _ac, _aam, _acm, _asv
  FROM public.daily_metrics
  WHERE employee_id = _employee_id
    AND EXTRACT(MONTH FROM date) = _month
    AND EXTRACT(YEAR  FROM date) = _year;

  -- Upsert monthly_targets (target_total_meetings is now a direct sum)
  INSERT INTO public.monthly_targets
    (employee_id, month, year, target_total_calls, target_total_meetings)
  VALUES
    (_employee_id, _month, _year, _tc, _ttm)
  ON CONFLICT (employee_id, month, year)
  DO UPDATE SET
    target_total_calls    = EXCLUDED.target_total_calls,
    target_total_meetings = EXCLUDED.target_total_meetings,
    updated_at            = NOW();

  -- Upsert monthly_actuals (unchanged — still tracks individual actuals)
  INSERT INTO public.monthly_actuals
    (employee_id, month, year, actual_calls, actual_architect_meetings, actual_client_meetings, actual_site_visits)
  VALUES
    (_employee_id, _month, _year, _ac, _aam, _acm, _asv)
  ON CONFLICT (employee_id, month, year)
  DO UPDATE SET
    actual_calls              = EXCLUDED.actual_calls,
    actual_architect_meetings = EXCLUDED.actual_architect_meetings,
    actual_client_meetings    = EXCLUDED.actual_client_meetings,
    actual_site_visits        = EXCLUDED.actual_site_visits,
    updated_at                = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- NOTE: sync_daily_to_monthly() trigger function needs NO changes — it only
-- dispatches to _sync_monthly_from_daily() which was updated above.
-- ============================================================================
