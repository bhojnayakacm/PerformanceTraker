-- ============================================================================
-- 0014_add_employee_doj.sql
-- Add `date_of_joining` to employees so HR-style metadata travels alongside
-- the operational record. Nullable on purpose: bulk-imported back-catalogue
-- employees may not have a known DOJ, and we'd rather show a clean "—" than
-- fabricate a value.
-- ============================================================================
-- The column lives on the same row as `emp_id` / `location` / `state` because
-- these are all stable per-employee facts. The performance-data tables
-- (monthly_actuals, daily_metrics, …) reference the employee through
-- `employee_id`, so they automatically see the DOJ once it's set — no extra
-- joins needed in the read path.
-- ============================================================================

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS date_of_joining DATE;

COMMENT ON COLUMN public.employees.date_of_joining IS
  'HR date of joining. Nullable — historical imports may not carry it. UI fall-back is the emp_id when unset.';

-- ============================================================================
-- DONE.
-- ============================================================================
