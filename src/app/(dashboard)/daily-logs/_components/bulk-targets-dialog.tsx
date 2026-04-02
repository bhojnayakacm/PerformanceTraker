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
  const [month, setMonth] = useState(defaultMonth);
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
      setMonth(defaultMonth);
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

  const workingDayCount = useMemo(() => {
    const daysInMonth = new Date(year, month, 0).getDate();
    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const weekday = new Date(year, month - 1, d).getDay();
      if (activeDays.has(weekday)) count++;
    }
    return count;
  }, [month, year, activeDays]);

  const totalEntries = workingDayCount * employeeCount;

  const selectedEmployees = useMemo(() => {
    if (isAllSelected) return [];
    return employees.filter((e) => selectedIds.has(e.id));
  }, [isAllSelected, selectedIds, employees]);

  const handleApply = () => {
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
        month,
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
        `Applied targets to ${workingDayCount} days for ${employeeCount} employee${employeeCount > 1 ? "s" : ""}`
      );
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Set Monthly Targets
          </DialogTitle>
          <DialogDescription>
            Apply uniform daily targets across all working days in a month.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Month & Year */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Month</Label>
              <Select
                value={String(month)}
                onValueChange={(v) => setMonth(Number(v))}
              >
                <SelectTrigger className="w-full">
                  <span className="flex-1 text-left">{MONTHS[month - 1]}</span>
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {MONTHS.map((name, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Year</Label>
              <Select
                value={String(year)}
                onValueChange={(v) => setYear(Number(v))}
              >
                <SelectTrigger className="w-full">
                  <span className="flex-1 text-left">{year}</span>
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

          {/* Daily Targets */}
          <div className="grid grid-cols-2 gap-3">
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
                    val === "" ? null : Math.max(0, parseInt(val) || 0)
                  );
                }}
                placeholder="0"
              />
            </div>
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
                    val === "" ? null : Math.max(0, parseInt(val) || 0)
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

          {/* Preview */}
          <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm">
              <CalendarRange className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>
                <span className="font-medium">{workingDayCount}</span> working
                days{" \u00d7 "}
                <span className="font-medium">{employeeCount}</span> employee
                {employeeCount !== 1 ? "s" : ""}
                {" = "}
                <span className="font-semibold text-foreground">
                  {totalEntries}
                </span>{" "}
                target entries
              </span>
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
