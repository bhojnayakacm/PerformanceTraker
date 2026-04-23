-- ============================================================================
-- 0013_monthly_target_plan.sql
-- Persist the "designated daily plan" on monthly_targets so MTD cumulative
-- math stops depending on whether a daily_metrics row happens to exist.
-- ============================================================================
-- PROBLEM
-- -------
-- Before this migration, the cumulative target for the current month was
-- computed by summing `daily_metrics.target_calls` / `target_total_meetings`
-- across rows between the first-of-month and today. Two sparse-data cases
-- broke this:
--
--   1. User ran "Set Targets" for only a subset of elapsed days (e.g. typed
--      per-day values via the Daily Logs grid instead of the bulk dialog).
--      → unlogged days had no row, contributing 0 to the MTD target.
--
--   2. User imported actuals via CSV without first running "Set Targets".
--      → new rows were created with target_calls = 0 (CSV no longer writes
--      targets), so those rows contributed 0 to the target side even though
--      the employee really did have a target for that day.
--
-- Result: MTD cumulative target was artificially low, ratios looked healthy,
-- and red (< 70%) cells never appeared for days where actuals were missing.
--
-- FIX
-- ---
-- Add three columns to monthly_targets that store the *designated* daily
-- rate and the set of working weekdays. The bulk-targets action writes
-- them; server-side MTD code enumerates elapsed working days and falls
-- back to the designated rate whenever a daily_metrics row is missing.
--
-- These columns are deliberately left untouched by the existing rollup
-- trigger (_sync_monthly_from_daily), which only updates
-- target_total_calls + target_total_meetings on its ON CONFLICT UPDATE.
-- ============================================================================

ALTER TABLE public.monthly_targets
  ADD COLUMN IF NOT EXISTS daily_target_calls           INT        NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_target_total_meetings  INT        NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS working_weekdays             SMALLINT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5];

COMMENT ON COLUMN public.monthly_targets.daily_target_calls IS
  'Designated per-working-day target for calls. Set by the "Set Targets" dialog; used by the MTD calculator to fill in targets for elapsed working days that have no daily_metrics row. Trigger does NOT overwrite.';

COMMENT ON COLUMN public.monthly_targets.daily_target_total_meetings IS
  'Designated per-working-day target for the combined meetings bucket (architect + client + site visits). Same semantics as daily_target_calls.';

COMMENT ON COLUMN public.monthly_targets.working_weekdays IS
  'Weekday numbers that count as working days for MTD pacing. JS getDay() convention: 0=Sun, 1=Mon, …, 6=Sat. Default [1,2,3,4,5] = Mon–Fri.';

-- ============================================================================
-- DONE. Monthly target plan columns added.
-- ============================================================================
