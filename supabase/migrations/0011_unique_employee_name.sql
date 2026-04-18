-- ============================================================================
-- 0011_unique_employee_name.sql
-- Enforce globally unique employee names. This unlocks the import UX where
-- operators reference employees by "Name" instead of the opaque emp_id.
--
-- Exact-match (case-sensitive) uniqueness. UNIQUE automatically creates a
-- btree index, so name-based lookups during bulk imports stay O(log n).
--
-- PRE-FLIGHT: If any duplicate names exist, this migration will abort. Run
--   SELECT name, COUNT(*) FROM public.employees GROUP BY name HAVING COUNT(*) > 1;
-- and resolve manually before applying.
-- ============================================================================

ALTER TABLE public.employees
  ADD CONSTRAINT employees_name_unique UNIQUE (name);
