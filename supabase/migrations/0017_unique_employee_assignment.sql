-- ============================================================================
-- 0017_unique_employee_assignment.sql
-- Enforce a 1-to-1 relationship between employees and Custom Admins.
--
-- Previously, manager_assignments carried UNIQUE(manager_id, employee_id) —
-- i.e. each (manager, employee) pair could only appear once, but the SAME
-- employee could legally appear under multiple managers. That's wrong for our
-- access-control model: an employee should answer to exactly one Custom Admin
-- so that "scope of visibility" is well-defined and counts on the User
-- Management page are meaningful.
--
-- This migration upgrades the constraint from the composite pair to a single-
-- column UNIQUE on employee_id, which subsumes the pair constraint and
-- makes the supporting non-unique index redundant.
--
-- PRE-FLIGHT (already verified by the requester): every Custom Admin's
-- current employee set is disjoint, so this migration will NOT fail on
-- existing data. To re-verify before applying:
--
--   SELECT employee_id, COUNT(*)
--   FROM public.manager_assignments
--   GROUP BY employee_id
--   HAVING COUNT(*) > 1;
-- ============================================================================

-- 1. Drop the composite UNIQUE (and its implicit btree index). It becomes
--    strictly redundant once UNIQUE(employee_id) exists: a single employee_id
--    can appear at most once, so any (manager_id, employee_id) pair is
--    trivially unique too. The auto-generated constraint name follows
--    Postgres's default: <table>_<col1>_<col2>_key.
ALTER TABLE public.manager_assignments
  DROP CONSTRAINT manager_assignments_manager_id_employee_id_key;

-- 2. Drop the standalone non-unique index on employee_id created in 0007.
--    The new UNIQUE constraint below builds its own btree index on the same
--    column, which serves every existing access pattern (lookup by employee,
--    cascade delete). Keeping both would be pure write/storage overhead.
DROP INDEX IF EXISTS public.idx_manager_assignments_employee;

-- 3. The new constraint: each employee is the responsibility of exactly one
--    Custom Admin. The server action that writes to this table performs a
--    graceful "transfer" pre-delete so the happy path never surfaces a 23505,
--    but the constraint remains the backstop for race conditions and any
--    direct-SQL bulk imports that bypass the action layer.
ALTER TABLE public.manager_assignments
  ADD CONSTRAINT manager_assignments_employee_id_key UNIQUE (employee_id);

COMMENT ON CONSTRAINT manager_assignments_employee_id_key
  ON public.manager_assignments IS
  '1-to-1: each employee belongs to exactly one Custom Admin. See 0017.';
