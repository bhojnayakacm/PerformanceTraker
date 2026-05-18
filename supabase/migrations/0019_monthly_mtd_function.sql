-- ============================================================================
-- 0019_monthly_mtd_function.sql
-- Move the MTD ("Month-to-Date") calendar-walk + sparse-fill computation
-- out of the JavaScript client and into a STABLE set-returning function
-- callable via PostgREST .rpc().
-- ============================================================================
-- WHY
-- ---
-- Before this migration, every page load of /monthly-data caused the
-- client to fetch all daily_metrics rows for the period (paginated 1000
-- at a time, defending against PostgREST's row cap) and walk a calendar
-- in JavaScript to produce the MTD totals. For an org with N employees
-- and D days in the month, that is N*D rows over the wire per refresh —
-- thousands of rows for a 100-employee tenant. The CPU cost was on the
-- client, but the bandwidth and time-to-render cost was real.
--
-- The new function takes (month, year), runs the walk in Postgres
-- exactly once per request, and returns at most N rows of pre-summed
-- INTs. Network bytes drop by ~30x and the work happens on the same
-- machine that owns the data.
--
-- WHY A FUNCTION, NOT A VIEW OR TRIGGER
-- -------------------------------------
--   • Trigger: MTD's window is "first-of-month through CURRENT_DATE",
--     which advances every midnight WITHOUT any data change. A write-
--     time trigger can't observe calendar advance — would need a cron
--     job or a stale "computed today" column.
--   • Plain View: cannot accept (month, year) parameters. A view that
--     pre-materializes every month is wasteful; one keyed on CURRENT_DATE
--     covers only the current month.
--   • SQL function: takes parameters; STABLE so the planner can inline;
--     SECURITY INVOKER so daily_metrics / monthly_targets RLS still gates
--     access; exposed as `supabase.rpc('get_monthly_mtd', ...)`.
--
-- SEMANTICS — mirrors the JS calendar walk byte-for-byte
-- ------------------------------------------------------
--   1. Window  = [first-of-month, LEAST(end-of-month, CURRENT_DATE)]
--      → past months: full month; current month: through today; future
--        months: empty window → returns no rows (safe degrade).
--   2. Targets  = walk the calendar over working_weekdays.
--        per day: if a daily_metrics row exists, use its target_*;
--                 else use the sparse-fill rate.
--      Sparse-fill rate = monthly_targets.daily_target_* if > 0,
--                         else MAX(target_* across any daily row this
--                         month for that employee) — picks up per-day
--                         targets typed in the Daily Logs grid without
--                         the bulk-targets dialog.
--   3. Actuals  = SUM of every logged daily row, no weekday filter.
--      A non-working-day actual still counts (matches the existing
--      _sync_monthly_from_daily trigger).
--
-- The function returns ONE ROW PER EMPLOYEE that has either a
-- monthly_targets row OR at least one daily_metrics row in the window.
-- Employees with neither are absent from the result; the client
-- defaults them to 0 in its merge step.
--
-- IDEMPOTENCY
-- -----------
-- `CREATE OR REPLACE FUNCTION` — safe to re-run. The function reads,
-- never writes — no data is touched by this migration.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_monthly_mtd(
  _month INT,
  _year  INT
)
RETURNS TABLE (
  employee_id                   UUID,
  mtd_target_calls              INT,
  mtd_target_total_meetings     INT,
  mtd_actual_calls              INT,
  mtd_actual_architect_meetings INT,
  mtd_actual_client_meetings    INT,
  mtd_actual_site_visits        INT
)
LANGUAGE sql
STABLE
AS $$
WITH
  -- Window. LEAST() handles current-month-cap, past-month-full, and
  -- future-month-empty in a single expression. For a future month,
  -- start_date > end_date, so generate_series below returns nothing.
  bounds AS (
    SELECT
      make_date(_year, _month, 1) AS start_date,
      LEAST(
        (make_date(_year, _month, 1) + INTERVAL '1 month - 1 day')::DATE,
        CURRENT_DATE
      ) AS end_date
  ),

  -- All daily rows for the window. COALESCE is paranoid (columns are
  -- NOT NULL DEFAULT 0) but cheap and removes a class of foot-guns if
  -- a future migration relaxes the constraints.
  daily AS (
    SELECT
      dm.employee_id,
      dm.date,
      EXTRACT(DOW FROM dm.date)::SMALLINT                    AS dow,
      COALESCE(dm.target_calls, 0)                           AS target_calls,
      COALESCE(dm.target_total_meetings, 0)                  AS target_total_meetings,
      COALESCE(dm.actual_calls, 0)                           AS actual_calls,
      COALESCE(dm.actual_architect_meetings, 0)              AS actual_architect_meetings,
      COALESCE(dm.actual_client_meetings, 0)                 AS actual_client_meetings,
      COALESCE(dm.actual_site_visits, 0)                     AS actual_site_visits
    FROM public.daily_metrics dm
    CROSS JOIN bounds b
    WHERE dm.date >= b.start_date AND dm.date <= b.end_date
  ),

  -- Monthly plan row, if any. Defaults applied at the join site so a
  -- missing plan still produces sensible (zero-filled) values.
  plans AS (
    SELECT
      mt.employee_id,
      COALESCE(mt.daily_target_calls, 0)                              AS plan_calls,
      COALESCE(mt.daily_target_total_meetings, 0)                     AS plan_meetings,
      COALESCE(mt.working_weekdays, ARRAY[1,2,3,4,5]::SMALLINT[])     AS working_weekdays
    FROM public.monthly_targets mt
    WHERE mt.month = _month AND mt.year = _year
  ),

  -- Inferred fallback rate = MAX target seen across ALL daily rows for
  -- this employee in this window. Mirrors the JS pass that scans the
  -- whole map regardless of weekday.
  inferred AS (
    SELECT
      employee_id,
      COALESCE(MAX(target_calls), 0)          AS inferred_calls,
      COALESCE(MAX(target_total_meetings), 0) AS inferred_meetings
    FROM daily
    GROUP BY employee_id
  ),

  -- Universe = anyone with a plan OR any daily row in the window.
  -- Employees with NEITHER would contribute zero everywhere and the
  -- client falls back to 0 for missing keys — no need to enumerate
  -- them server-side.
  employee_universe AS (
    SELECT employee_id FROM plans
    UNION
    SELECT DISTINCT employee_id FROM daily
  ),

  -- Effective per-employee parameters. sparse_*_fill mirrors the JS
  -- ternary EXACTLY: prefer plan rate when > 0, else inferred rate
  -- (NOT GREATEST — the plan deliberately wins even if smaller).
  effective AS (
    SELECT
      eu.employee_id,
      COALESCE(p.working_weekdays, ARRAY[1,2,3,4,5]::SMALLINT[]) AS working_weekdays,
      CASE
        WHEN COALESCE(p.plan_calls, 0) > 0
        THEN COALESCE(p.plan_calls, 0)
        ELSE COALESCE(i.inferred_calls, 0)
      END AS sparse_calls_fill,
      CASE
        WHEN COALESCE(p.plan_meetings, 0) > 0
        THEN COALESCE(p.plan_meetings, 0)
        ELSE COALESCE(i.inferred_meetings, 0)
      END AS sparse_meetings_fill
    FROM employee_universe eu
    LEFT JOIN plans    p ON p.employee_id = eu.employee_id
    LEFT JOIN inferred i ON i.employee_id = eu.employee_id
  ),

  -- Calendar of every day in the window. generate_series degrades to
  -- zero rows when start > end (future months).
  calendar AS (
    SELECT
      d::DATE                       AS day,
      EXTRACT(DOW FROM d)::SMALLINT AS dow
    FROM bounds b,
         generate_series(b.start_date, b.end_date, INTERVAL '1 day') d
  ),

  -- Per-employee per-working-day target contribution. The LEFT JOIN
  -- onto daily yields NULL on dm.employee_id when there's no row for
  -- that day, which is the signal to use sparse fill — NOT the value
  -- of dm.target_calls (a present-but-zero row should contribute 0,
  -- not the sparse-fill).
  target_per_day AS (
    SELECT
      e.employee_id,
      CASE
        WHEN dm.employee_id IS NOT NULL THEN dm.target_calls
        ELSE e.sparse_calls_fill
      END AS day_target_calls,
      CASE
        WHEN dm.employee_id IS NOT NULL THEN dm.target_total_meetings
        ELSE e.sparse_meetings_fill
      END AS day_target_meetings
    FROM effective e
    CROSS JOIN calendar c
    LEFT JOIN daily dm
      ON dm.employee_id = e.employee_id AND dm.date = c.day
    WHERE c.dow = ANY (e.working_weekdays)
  ),

  target_rollup AS (
    SELECT
      employee_id,
      COALESCE(SUM(day_target_calls), 0)::INT     AS mtd_target_calls,
      COALESCE(SUM(day_target_meetings), 0)::INT  AS mtd_target_total_meetings
    FROM target_per_day
    GROUP BY employee_id
  ),

  -- Actuals sum every logged row, ignoring the weekday gate (matches
  -- _sync_monthly_from_daily and the JS Pass 1).
  actual_rollup AS (
    SELECT
      employee_id,
      COALESCE(SUM(actual_calls), 0)::INT              AS mtd_actual_calls,
      COALESCE(SUM(actual_architect_meetings), 0)::INT AS mtd_actual_architect_meetings,
      COALESCE(SUM(actual_client_meetings), 0)::INT    AS mtd_actual_client_meetings,
      COALESCE(SUM(actual_site_visits), 0)::INT        AS mtd_actual_site_visits
    FROM daily
    GROUP BY employee_id
  )
SELECT
  eu.employee_id,
  COALESCE(tr.mtd_target_calls, 0)::INT,
  COALESCE(tr.mtd_target_total_meetings, 0)::INT,
  COALESCE(ar.mtd_actual_calls, 0)::INT,
  COALESCE(ar.mtd_actual_architect_meetings, 0)::INT,
  COALESCE(ar.mtd_actual_client_meetings, 0)::INT,
  COALESCE(ar.mtd_actual_site_visits, 0)::INT
FROM employee_universe eu
LEFT JOIN target_rollup tr ON tr.employee_id = eu.employee_id
LEFT JOIN actual_rollup ar ON ar.employee_id = eu.employee_id;
$$;

COMMENT ON FUNCTION public.get_monthly_mtd(INT, INT) IS
  'Per-employee MTD totals for (month, year). Walks the calendar in SQL with the same sparse-fill semantics as the old JS calendar walk, capped at CURRENT_DATE for the current month. STABLE + SECURITY INVOKER so RLS on daily_metrics/monthly_targets applies normally. Callable from PostgREST: supabase.rpc(''get_monthly_mtd'', { _month, _year }).';

-- Grant explicit EXECUTE to authenticated. Default is PUBLIC EXECUTE in
-- Supabase, but this makes the access surface obvious in pgAudit and
-- removes any reliance on the default.
GRANT EXECUTE ON FUNCTION public.get_monthly_mtd(INT, INT) TO authenticated;

-- ============================================================================
-- DONE. The Monthly Data page can now fetch MTD totals in a single
-- ~N-row .rpc() call instead of a paginated ~N*D-row daily_metrics
-- walk plus a JS calendar reconciliation.
-- ============================================================================
