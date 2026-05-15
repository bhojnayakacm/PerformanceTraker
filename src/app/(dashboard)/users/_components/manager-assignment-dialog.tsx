"use client";

import {
  useState,
  useMemo,
  useTransition,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { toast } from "sonner";
import { Loader2, Check, ChevronsUpDown, Search, X, Users, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Employee, EmployeeAssignment, Profile } from "@/lib/types";
import { cn, getInitials, getAvatarColor } from "@/lib/utils";
import { saveManagerAssignments } from "../actions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manager: Profile | null;
  employees: Employee[];
  assignments: EmployeeAssignment[];
};

export function ManagerAssignmentDialog({
  open,
  onOpenChange,
  manager,
  employees,
  assignments,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /* ── Lock map ─────────────────────────────────────────────────────────────
   *
   * Each employee belongs to at most one Custom Admin (UNIQUE(employee_id) in
   * migration 0017). When this dialog is open for manager X, every employee
   * already claimed by some manager Y ≠ X must be visually surfaced as locked
   * with a "Assigned to {Y.name}" hint — the Super Admin should never silently
   * pull employees from a peer admin's roster.
   *
   * The map keys on employee_id; lookups inside the row-render loop are O(1).
   * Built from the prop, which is loaded server-side at page render, so the
   * dialog opens instantly with no extra round-trip. */
  const assignmentByEmployee = useMemo(() => {
    const map = new Map<string, { managerId: string; managerName: string }>();
    for (const a of assignments) {
      map.set(a.employee_id, {
        managerId: a.manager_id,
        managerName: a.manager_name,
      });
    }
    return map;
  }, [assignments]);

  /* Reset selection only on open/target change. We DO NOT depend on
   * `assignments` here: re-running mid-edit because the parent re-fetched
   * would clobber in-progress selections. The disabled-row guard plus the
   * action's two-delete backstop are the integrity guarantees; the modal's
   * local state is allowed to be slightly stale within a session. */
  useEffect(() => {
    if (!open || !manager) return;
    setEmployeeSearch("");
    setDropdownOpen(false);
    const ids = new Set<string>();
    for (const a of assignments) {
      if (a.manager_id === manager.id) ids.add(a.employee_id);
    }
    setSelectedIds(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, manager]);

  // Click outside closes dropdown
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  // Escape closes dropdown without closing dialog
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setDropdownOpen(false);
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [dropdownOpen]);

  // Compute viewport-aware available height for dropdown
  useEffect(() => {
    if (!dropdownOpen || !dropdownRef.current) return;
    const compute = () => {
      if (!dropdownRef.current) return;
      const rect = dropdownRef.current.getBoundingClientRect();
      // Available space = viewport bottom - trigger bottom - gap(4px) - padding(16px)
      const available = window.innerHeight - rect.bottom - 20;
      dropdownRef.current.style.setProperty(
        "--available-height",
        `${Math.max(200, available)}px`
      );
    };
    requestAnimationFrame(compute);
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [dropdownOpen]);

  const filteredEmployees = useMemo(() => {
    if (!employeeSearch) return employees;
    const s = employeeSearch.toLowerCase();
    return employees.filter(
      (e) =>
        e.name.toLowerCase().includes(s) ||
        e.emp_id.toLowerCase().includes(s)
    );
  }, [employees, employeeSearch]);

  /* "Selectable" = employees the Super Admin can actually act on for THIS
   * manager: unassigned, or already on this manager's roster. Employees
   * claimed by a peer Custom Admin are excluded — they're rendered in the
   * list (with the "Assigned to {name}" hint) but cannot be picked or
   * counted toward the "All" toggle. The counter denominator uses this too,
   * so "5 of 40 selected" never overpromises a ceiling the user can't hit. */
  const selectableEmployees = useMemo(() => {
    if (!manager) return [];
    return employees.filter((e) => {
      const claim = assignmentByEmployee.get(e.id);
      return !claim || claim.managerId === manager.id;
    });
  }, [employees, assignmentByEmployee, manager]);

  const toggleEmployee = useCallback(
    (id: string) => {
      // Defensive: the disabled button below already prevents this path, but
      // a stray programmatic call (or a race where claim metadata changed
      // since render) should never silently promote a locked row.
      const claim = assignmentByEmployee.get(id);
      if (claim && manager && claim.managerId !== manager.id) return;
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [assignmentByEmployee, manager],
  );

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === selectableEmployees.length) return new Set();
      return new Set(selectableEmployees.map((e) => e.id));
    });
  }, [selectableEmployees]);

  const selectedEmployees = useMemo(
    () => employees.filter((e) => selectedIds.has(e.id)),
    [selectedIds, employees]
  );

  const handleSave = () => {
    if (!manager) return;

    startTransition(async () => {
      const result = await saveManagerAssignments(
        manager.id,
        Array.from(selectedIds)
      );

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success(
        `Assigned ${selectedIds.size} employee${selectedIds.size !== 1 ? "s" : ""} to ${manager.full_name || "custom admin"}`
      );
      onOpenChange(false);
    });
  };

  const managerName = manager?.full_name || "Custom Admin";
  const isAllSelected =
    selectableEmployees.length > 0 &&
    selectedIds.size === selectableEmployees.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Assign Employees
          </DialogTitle>
          <DialogDescription>
            Select which employees{" "}
            <span className="font-medium text-foreground">{managerName}</span>{" "}
            can view and manage.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
            {/* Employee Multi-Select Combobox */}
            <div className="space-y-2">
              <Label>
                Employees ({selectedIds.size} of {selectableEmployees.length}{" "}
                selected)
              </Label>
              <div ref={dropdownRef} className="relative">
                {/* Trigger */}
                <div
                  role="combobox"
                  aria-expanded={dropdownOpen}
                  aria-controls="assignment-listbox"
                  tabIndex={0}
                  onClick={() => setDropdownOpen((p) => !p)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setDropdownOpen((p) => !p);
                    }
                  }}
                  className={cn(
                    "flex w-full min-h-10 flex-wrap items-center gap-1 rounded-md border border-input bg-background px-3 py-2 text-sm cursor-pointer transition-colors",
                    "hover:border-ring/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    dropdownOpen && "ring-2 ring-ring"
                  )}
                >
                  {selectedIds.size === 0 ? (
                    <span className="text-muted-foreground">
                      Select employees...
                    </span>
                  ) : isAllSelected ? (
                    <span>All Employees ({selectableEmployees.length})</span>
                  ) : (
                    <div className="flex flex-wrap gap-1 max-h-[120px] overflow-y-auto rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 shadow-inner p-1.5 w-full">
                      {selectedEmployees.map((emp) => (
                        <span
                          key={emp.id}
                          className="inline-flex items-center gap-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-xs font-medium shadow-sm"
                        >
                          {emp.name}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleEmployee(emp.id);
                            }}
                            className="ml-0.5 rounded-sm opacity-60 hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-colors"
                            aria-label={`Remove ${emp.name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 self-start mt-0.5 opacity-50" />
                </div>

                {/* Dropdown panel */}
                {dropdownOpen && (
                  <div
                    className="absolute z-50 top-[calc(100%+4px)] left-0 w-full flex flex-col rounded-lg border bg-popover text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95 duration-100"
                    style={{ maxHeight: "var(--available-height, 300px)" }}
                  >
                    {/* Search — pinned top */}
                    <div className="shrink-0 p-2">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <input
                          autoFocus
                          className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                          placeholder="Search employees..."
                          value={employeeSearch}
                          onChange={(e) => setEmployeeSearch(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>

                    <div className="shrink-0 border-t" />

                    {/* All toggle — pinned */}
                    <button
                      type="button"
                      className="shrink-0 flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleAll();
                      }}
                    >
                      <div
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors",
                          isAllSelected
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-input"
                        )}
                      >
                        {isAllSelected && <Check className="h-3 w-3" />}
                      </div>
                      <span className="font-medium">All Employees</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {selectableEmployees.length}
                      </span>
                    </button>

                    <div className="shrink-0 border-t" />

                    {/* List — scrollable, takes remaining space */}
                    <div
                      id="assignment-listbox"
                      role="listbox"
                      className="flex-1 min-h-0 overflow-y-auto py-1"
                    >
                      {filteredEmployees.map((emp) => {
                        const checked = selectedIds.has(emp.id);
                        const claim = assignmentByEmployee.get(emp.id);
                        // Locked when claimed by SOMEONE ELSE. Claimed by the
                        // current manager? That's their existing assignment
                        // and stays selectable so it can be unchecked.
                        const isLocked =
                          claim != null &&
                          manager != null &&
                          claim.managerId !== manager.id;
                        return (
                          <button
                            key={emp.id}
                            type="button"
                            disabled={isLocked}
                            aria-disabled={isLocked || undefined}
                            title={
                              isLocked
                                ? `Assigned to ${claim.managerName}`
                                : undefined
                            }
                            className={cn(
                              "flex w-full items-center gap-2.5 px-3 py-1.5 text-sm transition-colors",
                              isLocked
                                ? "cursor-not-allowed opacity-60"
                                : "hover:bg-muted/50"
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isLocked) return;
                              toggleEmployee(emp.id);
                            }}
                          >
                            <div
                              className={cn(
                                "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors",
                                isLocked
                                  ? "border-slate-200 bg-slate-100"
                                  : checked
                                    ? "bg-primary border-primary text-primary-foreground"
                                    : "border-input"
                              )}
                            >
                              {isLocked ? (
                                <Lock className="h-2.5 w-2.5 text-slate-400" />
                              ) : (
                                checked && <Check className="h-3 w-3" />
                              )}
                            </div>
                            <div
                              className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[8px] font-semibold ${getAvatarColor(emp.name)}`}
                            >
                              {getInitials(emp.name)}
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col items-start text-left leading-tight">
                              <span className="w-full truncate">{emp.name}</span>
                              {isLocked && claim && (
                                <span className="w-full truncate text-[10px] text-muted-foreground">
                                  Assigned to {claim.managerName}
                                </span>
                              )}
                            </div>
                            <span className="ml-auto text-xs text-muted-foreground shrink-0">
                              {emp.emp_id}
                            </span>
                          </button>
                        );
                      })}
                      {filteredEmployees.length === 0 && (
                        <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                          No employees found
                        </div>
                      )}
                    </div>

                    {/* Done — pinned bottom */}
                    <div className="shrink-0 border-t p-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDropdownOpen(false);
                        }}
                      >
                        Done
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Assignments"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
