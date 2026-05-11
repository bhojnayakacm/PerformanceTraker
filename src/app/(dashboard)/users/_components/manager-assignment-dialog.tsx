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
import { Loader2, Check, ChevronsUpDown, Search, X, Users } from "lucide-react";
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
import type { Employee, Profile } from "@/lib/types";
import { cn, getInitials, getAvatarColor } from "@/lib/utils";
import { getManagerAssignments, saveManagerAssignments } from "../actions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manager: Profile | null;
  employees: Employee[];
};

export function ManagerAssignmentDialog({
  open,
  onOpenChange,
  manager,
  employees,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load current assignments when dialog opens
  useEffect(() => {
    if (open && manager) {
      setIsLoading(true);
      setEmployeeSearch("");
      setDropdownOpen(false);
      getManagerAssignments(manager.id).then((ids) => {
        setSelectedIds(new Set(ids));
        setIsLoading(false);
      });
    }
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

  const toggleEmployee = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === employees.length) return new Set();
      return new Set(employees.map((e) => e.id));
    });
  }, [employees]);

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
  const isAllSelected = selectedIds.size === employees.length && employees.length > 0;

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

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Employee Multi-Select Combobox */}
            <div className="space-y-2">
              <Label>
                Employees ({selectedIds.size} of {employees.length} selected)
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
                    <span>All Employees ({employees.length})</span>
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
                        {employees.length}
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
                        return (
                          <button
                            key={emp.id}
                            type="button"
                            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleEmployee(emp.id);
                            }}
                          >
                            <div
                              className={cn(
                                "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors",
                                checked
                                  ? "bg-primary border-primary text-primary-foreground"
                                  : "border-input"
                              )}
                            >
                              {checked && <Check className="h-3 w-3" />}
                            </div>
                            <div
                              className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[8px] font-semibold ${getAvatarColor(emp.name)}`}
                            >
                              {getInitials(emp.name)}
                            </div>
                            <span className="truncate">{emp.name}</span>
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
        )}

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
            disabled={isPending || isLoading}
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
