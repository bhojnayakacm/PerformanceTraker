-- ============================================================================
-- 0012_city_tours_decimal_days.sql
-- Purpose: allow half-day tours (e.g. 0.5) in monthly_city_tours.
--
-- Before: target_days / actual_days were INT NOT NULL DEFAULT 0 — Postgres
--         silently truncates 0.5 → 0 on insert.
-- After:  NUMERIC(5,2) — stores up to 999.99 with 2 decimal places, which
--         is more than enough for a calendar month (max 31.00) and leaves
--         headroom if the business ever tracks quarter-days.
-- ============================================================================

ALTER TABLE public.monthly_city_tours
  ALTER COLUMN target_days TYPE NUMERIC(5, 2) USING target_days::NUMERIC(5, 2),
  ALTER COLUMN actual_days TYPE NUMERIC(5, 2) USING actual_days::NUMERIC(5, 2);

-- ALTER COLUMN TYPE preserves DEFAULT, but restate it so a future reader
-- doesn't have to cross-reference 0008 to confirm it's still 0.
ALTER TABLE public.monthly_city_tours
  ALTER COLUMN target_days SET DEFAULT 0,
  ALTER COLUMN actual_days SET DEFAULT 0;

-- Guard against nonsense values. A month has at most 31 days; 0.5 steps are
-- business-allowed, so 31.00 is the cap. No need to enforce step granularity
-- at the DB level — that's the app's job.
ALTER TABLE public.monthly_city_tours
  DROP CONSTRAINT IF EXISTS monthly_city_tours_target_days_check,
  DROP CONSTRAINT IF EXISTS monthly_city_tours_actual_days_check;

ALTER TABLE public.monthly_city_tours
  ADD CONSTRAINT monthly_city_tours_target_days_check
    CHECK (target_days >= 0 AND target_days <= 31),
  ADD CONSTRAINT monthly_city_tours_actual_days_check
    CHECK (actual_days >= 0 AND actual_days <= 31);
