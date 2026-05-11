-- ============================================================================
-- 0016_add_reporting_manager.sql
-- Self-referencing FK on employees → 2-tier reporting hierarchy.
-- ============================================================================
-- Schema choice: a single nullable `reporting_manager_id UUID` column on the
-- `employees` table that references `employees.id`. Considered alternatives:
--
--   • Separate `senior_employees` / `junior_employees` tables — duplicates row
--     identity and makes joins awkward; junior promotions become row moves.
--   • A `tier` enum column alongside the FK — encodes the same fact in two
--     columns and creates a synchronization burden.
--
-- The self-FK is the canonical normalised form. The 2-tier invariant is
-- enforced by the trigger below (defence in depth — UI also gates the picker).
--
-- ON DELETE SET NULL is deliberate: losing a senior employee promotes their
-- reports to top-level rather than wiping rows. CASCADE would silently delete
-- direct reports along with their manager — wrong for HR data.
-- ============================================================================


-- ── 1. Column + index + trivial CHECK ───────────────────────────────────────
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS reporting_manager_id UUID
  REFERENCES public.employees(id) ON DELETE SET NULL;

-- Indexed only on non-null values — saves space (most rows in a small org
-- have no manager, and the manager_id == NULL case is never queried).
CREATE INDEX IF NOT EXISTS idx_employees_reporting_manager_id
  ON public.employees (reporting_manager_id)
  WHERE reporting_manager_id IS NOT NULL;

-- Trivial guardrail: an employee can never report to themselves. This catches
-- buggy clients that round-trip `id` straight back into `reporting_manager_id`
-- without going through the trigger below.
ALTER TABLE public.employees
  ADD CONSTRAINT employees_no_self_report
  CHECK (id <> reporting_manager_id);

COMMENT ON COLUMN public.employees.reporting_manager_id IS
  '2-tier hierarchy. Nullable self-FK to a Tier-1 (top-level) employee. ON DELETE SET NULL — promoting reports rather than cascading deletion.';


-- ── 2. Trigger: enforce STRICT 2-tier invariant ─────────────────────────────
-- A CHECK constraint cannot peek at other rows, so the multi-row predicates
-- live in a BEFORE INSERT/UPDATE trigger.
--
-- Two failure modes are blocked:
--
--   (a) Picking a manager who is themselves a junior. Allowing this would
--       create Tier 3, breaking the contract the dashboard UI is built on.
--
--   (b) Demoting an existing manager (i.e. setting reporting_manager_id on a
--       row that other rows already point at). Their existing reports would
--       become Tier 3 in the new arrangement.
--
-- The trigger fires only when reporting_manager_id is being touched, so
-- unrelated UPDATEs (name, location, is_active toggle) take zero overhead.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_two_tier_hierarchy()
RETURNS TRIGGER AS $$
BEGIN
  -- Promotion to Tier-1 (clearing the FK) is always safe — exit early.
  IF NEW.reporting_manager_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- (a) The proposed manager must themselves be Tier-1.
  IF EXISTS (
    SELECT 1
    FROM   public.employees
    WHERE  id = NEW.reporting_manager_id
      AND  reporting_manager_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cannot assign a manager who already reports to someone (2-tier hierarchy)'
      USING ERRCODE = '23514',
            DETAIL  = format('Target manager %s is itself a junior employee.', NEW.reporting_manager_id);
  END IF;

  -- (b) This row must have no direct reports of its own.
  IF EXISTS (
    SELECT 1
    FROM   public.employees
    WHERE  reporting_manager_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Cannot assign a manager to an employee who has direct reports (2-tier hierarchy)'
      USING ERRCODE = '23514',
            DETAIL  = format('Employee %s already manages other employees.', NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_two_tier_hierarchy ON public.employees;
CREATE TRIGGER trg_enforce_two_tier_hierarchy
  BEFORE INSERT OR UPDATE OF reporting_manager_id ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_two_tier_hierarchy();


-- ============================================================================
-- DONE. The column is in place and the 2-tier invariant is guaranteed by the
-- trigger. The cascading search relies on this column being present and
-- correctly indexed, so this migration must run before the application code
-- that queries against it.
-- ============================================================================
