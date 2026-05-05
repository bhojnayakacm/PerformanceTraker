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
import {
  Loader2,
  Target,
  CalendarRange,
  Check,
  ChevronsUpDown,
  Search,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { Employee } from "@/lib/types";
import { cn } from "@/lib/utils";
import { bulkSetMonthlyTargets } from "../actions";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/* Calendar-quarter presets — the dialog scopes to a single Year, so we use
 * calendar quarters (Jan-Mar = Q1) rather than fiscal-year quarters to avoid
 * the "Q4 in 2025 means Jan-Mar 2025 or 2026?" ambiguity that the FY framing
 * introduces. Picking a preset replaces the current selection — explicit
 * intent, no compounding from prior clicks. */
const MONTH_PRESETS = [
  { label: "Q1", months: [1, 2, 3] },
  { label: "Q2", months: [4, 5, 6] },
  { label: "Q3", months: [7, 8, 9] },
  { label: "Q4", months: [10, 11, 12] },
  { label: "Full Year", months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
] as const;

const WEEKDAYS = [
  { key: 1, label: "Mon" },
  { key: 2, label: "Tue" },
  { key: 3, label: "Wed" },
  { key: 4, label: "Thu" },
  { key: 5, label: "Fri" },
  { key: 6, label: "Sat" },
  { key: 0, label: "Sun" },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  defaultMonth: number;
  defaultYear: number;
};

export function BulkTargetsDialog({
  open,
  onOpenChange,
  employees,
  defaultMonth,
  defaultYear,
}: Props) {
  const [isPending, startTransition] = useTransition();
  /* Months as a Set so toggle/has are O(1) and the data model says "membership"
   * instead of "ordered list". We sort to an array only when we hand off to the
   * server action or the display layer. */
  const [months, setMonths] = useState<Set<number>>(
    () => new Set([defaultMonth]),
  );
  const [year, setYear] = useState(defaultYear);

  /* ── Multi-select state ── */
  const [isAllSelected, setIsAllSelected] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /* ── Target values: null = untouched, 0 = explicit zero ── */
  const [targetCalls, setTargetCalls] = useState<number | null>(null);
  const [targetMeetings, setTargetMeetings] = useState<number | null>(null);

  const [activeDays, setActiveDays] = useState<Set<number>>(
    () => new Set([1, 2, 3, 4, 5, 6])
  );

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setMonths(new Set([defaultMonth]));
      setYear(defaultYear);
      setIsAllSelected(true);
      setSelectedIds(new Set());
      setEmployeeSearch("");
      setDropdownOpen(false);
      setTargetCalls(null);
      setTargetMeetings(null);
      setActiveDays(new Set([1, 2, 3, 4, 5, 6]));
    }
  }, [open, defaultMonth, defaultYear]);

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

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const filteredEmployees = useMemo(() => {
    if (!employeeSearch) return employees;
    const s = employeeSearch.toLowerCase();
    return employees.filter(
      (e) =>
        e.name.toLowerCase().includes(s) ||
        e.emp_id.toLowerCase().includes(s)
    );
  }, [employees, employeeSearch]);

  const toggleEmployee = useCallback(
    (id: string) => {
      if (isAllSelected) {
        const next = new Set(employees.map((e) => e.id));
        next.delete(id);
        setIsAllSelected(false);
        setSelectedIds(next);
      } else {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
            if (next.size === employees.length) {
              setIsAllSelected(true);
              return new Set();
            }
          }
          return next;
        });
      }
    },
    [isAllSelected, employees]
  );

  const toggleAll = useCallback(() => {
    setIsAllSelected((prev) => !prev);
    setSelectedIds(new Set());
  }, []);

  const toggleDay = (day: number) => {
    setActiveDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const employeeCount = isAllSelected ? employees.length : selectedIds.size;

  const toggleMonth = useCallback((m: number) => {
    setMonths((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  }, []);

  /* Presets replace the selection rather than merging into it — clicking "Q1"
   * after a stray Sept means the user wants Q1, not Q1 + Sept. Less surprising. */
  const applyPreset = useCallback((preset: readonly number[]) => {
    setMonths(new Set(preset));
  }, []);

  const sortedMonths = useMemo(
    () => Array.from(months).sort((a, b) => a - b),
    [months],
  );

  const activePresetIndex = useMemo(() => {
    return MONTH_PRESETS.findIndex(
      (p) =>
        p.months.length === months.size && p.months.every((m) => months.has(m)),
    );
  }, [months]);

  /* Sum working days across all selected months. We deliberately recompute per
   * month (rather than caching by month-of-year) — N is at most 12 and the per-
   * month cost is two `new Date(...)` calls × ~30 iterations, which is dwarfed
   * by even one React render. Premature memoization here would just add code. */
  const workingDayCount = useMemo(() => {
    let count = 0;
    for (const m of months) {
      const daysInMonth = new Date(year, m, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const weekday = new Date(year, m - 1, d).getDay();
        if (activeDays.has(weekday)) count++;
      }
    }
    return count;
  }, [months, year, activeDays]);

  const monthCount = months.size;
  const totalEntries = workingDayCount * employeeCount;

  const selectedEmployees = useMemo(() => {
    if (isAllSelected) return [];
    return employees.filter((e) => selectedIds.has(e.id));
  }, [isAllSelected, selectedIds, employees]);

  const handleApply = () => {
    if (monthCount === 0) {
      toast.error("Select at least one month");
      return;
    }
    if (employeeCount === 0) {
      toast.error("Select at least one employee");
      return;
    }
    if (activeDays.size === 0) {
      toast.error("Select at least one working day");
      return;
    }
    if (targetCalls === null && targetMeetings === null) {
      toast.error("Set at least one target value");
      return;
    }

    startTransition(async () => {
      const result = await bulkSetMonthlyTargets({
        employee_ids: isAllSelected ? null : Array.from(selectedIds),
        months: sortedMonths,
        year,
        target_calls: targetCalls ?? 0,
        target_total_meetings: targetMeetings ?? 0,
        included_weekdays: Array.from(activeDays),
      });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success(
        `Applied targets to ${workingDayCount} day${workingDayCount === 1 ? "" : "s"} across ${monthCount} month${monthCount === 1 ? "" : "s"} for ${employeeCount} employee${employeeCount === 1 ? "" : "s"}`,
      );
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Set Monthly Targets
          </DialogTitle>
          <DialogDescription>
            Apply uniform daily targets across the working days of one or more
            months.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Months — primary entry point. Year sits inline on the right since
              it's the same scope (a single calendar year), and pulling it out
              of the way leaves the month grid as the visual focus. */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <Label>Months</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Year</span>
                <Select
                  value={String(year)}
                  onValueChange={(v) => setYear(Number(v))}
                >
                  <SelectTrigger className="h-8 w-[88px]">
                    <span className="flex-1 text-left">{year}</span>
                  </SelectTrigger>
                  <SelectContent align="end" alignItemWithTrigger={false}>
                    {years.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quick-selection presets — pill row, mirrors the cumulative-data
                range selector for cross-page consistency. */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 mb-1.5">
                Quick Selection
              </div>
              <div className="flex flex-wrap gap-1.5">
                {MONTH_PRESETS.map((p, i) => {
                  const isActive = i === activePresetIndex;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => applyPreset(p.months)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        isActive
                          ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/60 hover:text-indigo-700",
                      )}
                    >
                      {isActive && <Check className="h-3 w-3" />}
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4×3 month toggle grid. We use 3-letter labels so each cell
                stays compact and uniform — full names live in the title
                attribute for hover/screen-reader fidelity. */}
            <div className="grid grid-cols-4 gap-1.5">
              {MONTHS_SHORT.map((short, i) => {
                const m = i + 1;
                const isSelected = months.has(m);
                return (
                  <button
                    key={short}
                    type="button"
                    onClick={() => toggleMonth(m)}
                    title={MONTHS[i]}
                    aria-pressed={isSelected}
                    className={cn(
                      "rounded-lg py-2 text-xs font-medium transition-colors",
                      isSelected
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted text-muted-foreground hover:bg-muted/80",
                    )}
                  >
                    {short}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Employee Multi-Select Combobox */}
          <div className="space-y-2">
            <Label>Apply To</Label>
            <div ref={dropdownRef} className="relative">
              {/* Trigger */}
              <div
                role="combobox"
                aria-expanded={dropdownOpen}
                aria-controls="employee-listbox"
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
                {isAllSelected ? (
                  <span>All Employees ({employees.length})</span>
                ) : selectedIds.size === 0 ? (
                  <span className="text-muted-foreground">
                    Select employees...
                  </span>
                ) : (
                  <>
                    {selectedEmployees.slice(0, 3).map((emp) => (
                      <span
                        key={emp.id}
                        className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium"
                      >
                        {emp.name}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleEmployee(emp.id);
                          }}
                          className="ml-0.5 rounded-sm opacity-70 hover:opacity-100 hover:bg-muted-foreground/20"
                          aria-label={`Remove ${emp.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    {selectedEmployees.length > 3 && (
                      <span className="text-xs text-muted-foreground">
                        +{selectedEmployees.length - 3} more
                      </span>
                    )}
                  </>
                )}
                <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
              </div>

              {/* Dropdown panel */}
              {dropdownOpen && (
                <div className="absolute z-50 top-[calc(100%+4px)] left-0 w-full rounded-lg border bg-popover text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95 duration-100">
                  {/* Search */}
                  <div className="p-2">
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

                  <div className="border-t" />

                  {/* All Employees toggle */}
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
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

                  <div className="border-t" />

                  {/* Individual employee list */}
                  <div id="employee-listbox" role="listbox" className="max-h-48 overflow-y-auto py-1">
                    {filteredEmployees.map((emp) => {
                      const checked =
                        isAllSelected || selectedIds.has(emp.id);
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
                </div>
              )}
            </div>
          </div>

          {/* Daily Targets — Meetings is on the LEFT to mirror the daily-logs
              table column order; users entering bulk values build the same
              left-to-right scan path here as in the grid below. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="bulk-meetings">Daily Meetings Target</Label>
              <Input
                id="bulk-meetings"
                type="number"
                min={0}
                value={targetMeetings ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setTargetMeetings(
                    val === "" ? null : Math.max(0, parseInt(val) || 0),
                  );
                }}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-calls">Daily Calls Target</Label>
              <Input
                id="bulk-calls"
                type="number"
                min={0}
                value={targetCalls ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setTargetCalls(
                    val === "" ? null : Math.max(0, parseInt(val) || 0),
                  );
                }}
                placeholder="0"
              />
            </div>
          </div>

          {/* Working Days */}
          <div className="space-y-2">
            <Label>Working Days</Label>
            <div className="flex gap-1.5">
              {WEEKDAYS.map((day) => (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => toggleDay(day.key)}
                  className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${
                    activeDays.has(day.key)
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                  title={day.label}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preview \u2014 two-tier so the multi-month math is legible: small
              breakdown line (months \u00b7 days \u00b7 employees) sits above the headline
              total. tabular-nums keeps the digits steady as values change. */}
          <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
            <div className="flex items-start gap-2.5">
              <CalendarRange className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground tabular-nums">
                  <span className="font-medium text-foreground/80">
                    {monthCount}
                  </span>{" "}
                  {monthCount === 1 ? "month" : "months"}
                  <span className="mx-1.5 text-muted-foreground/40">\u00b7</span>
                  <span className="font-medium text-foreground/80">
                    {workingDayCount}
                  </span>{" "}
                  working {workingDayCount === 1 ? "day" : "days"}
                  <span className="mx-1.5 text-muted-foreground/40">\u00b7</span>
                  <span className="font-medium text-foreground/80">
                    {employeeCount}
                  </span>{" "}
                  {employeeCount === 1 ? "employee" : "employees"}
                </div>
                <div className="mt-0.5 text-sm font-semibold text-foreground tabular-nums">
                  {totalEntries.toLocaleString("en-IN")} target{" "}
                  {totalEntries === 1 ? "entry" : "entries"}
                </div>
              </div>
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
            onClick={handleApply}
            disabled={isPending || totalEntries === 0}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Applying...
              </>
            ) : (
              "Apply Targets"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
