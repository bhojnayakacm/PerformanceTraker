"use client";

import { useState, useTransition, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Save,
  Loader2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { Employee, UserRole, DailyMetric } from "@/lib/types";
import { getInitials, getAvatarColor } from "@/lib/utils";
import { saveDailyMetrics } from "../actions";

/* ── Types ── */

type MetricFields =
  | "target_calls"
  | "target_architect_meetings"
  | "target_client_meetings"
  | "target_site_visits"
  | "actual_calls"
  | "actual_architect_meetings"
  | "actual_client_meetings"
  | "actual_site_visits";

type EntryValues = Record<MetricFields, number>;

const EMPTY_ENTRY: EntryValues = {
  target_calls: 0,
  target_architect_meetings: 0,
  target_client_meetings: 0,
  target_site_visits: 0,
  actual_calls: 0,
  actual_architect_meetings: 0,
  actual_client_meetings: 0,
  actual_site_visits: 0,
};

type Props = {
  employees: Employee[];
  initialData: Record<string, DailyMetric>;
  date: string;
  userRole: UserRole;
};

/* ── Helpers ── */

function toEntryValues(dm: DailyMetric | undefined): EntryValues {
  if (!dm) return { ...EMPTY_ENTRY };
  return {
    target_calls: dm.target_calls,
    target_architect_meetings: dm.target_architect_meetings,
    target_client_meetings: dm.target_client_meetings,
    target_site_visits: dm.target_site_visits,
    actual_calls: dm.actual_calls,
    actual_architect_meetings: dm.actual_architect_meetings,
    actual_client_meetings: dm.actual_client_meetings,
    actual_site_visits: dm.actual_site_visits,
  };
}

/** Format a Date as YYYY-MM-DD using local time (avoids UTC shift). */
function toLocalDateString(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function shiftDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const shifted = new Date(y, m - 1, d + days);
  return toLocalDateString(shifted);
}

function formatShortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/* ── Component ── */

export function DailyLogView({
  employees,
  initialData,
  date,
  userRole,
}: Props) {
  const router = useRouter();
  const [isSaving, startSaveTransition] = useTransition();
  const [isNavigating, startNavigation] = useTransition();
  const canEditTargets = userRole === "super_admin";
  const canEdit = userRole !== "viewer";

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");

  const filteredEmployees = useMemo(() => {
    if (!searchFilter) return employees;
    const search = searchFilter.toLowerCase();
    return employees.filter(
      (emp) =>
        emp.name.toLowerCase().includes(search) ||
        emp.emp_id.toLowerCase().includes(search)
    );
  }, [employees, searchFilter]);

  const selectedDate = useMemo(() => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [date]);

  // Baseline from server — updated after successful save
  const [originalEntries, setOriginalEntries] = useState<
    Record<string, EntryValues>
  >(() => {
    const init: Record<string, EntryValues> = {};
    for (const emp of employees) {
      init[emp.id] = toEntryValues(initialData[emp.id]);
    }
    return init;
  });

  // Draft state: employee_id -> entry values
  const [entries, setEntries] = useState<Record<string, EntryValues>>(() => {
    const init: Record<string, EntryValues> = {};
    for (const emp of employees) {
      init[emp.id] = toEntryValues(initialData[emp.id]);
    }
    return init;
  });

  // Smart dirty — only true when draft actually differs from server baseline
  const dirty = useMemo(() => {
    const dirtySet = new Set<string>();
    const fields = Object.keys(EMPTY_ENTRY) as MetricFields[];
    for (const empId of Object.keys(entries)) {
      const orig = originalEntries[empId];
      const curr = entries[empId];
      if (!orig || !curr) continue;
      for (const f of fields) {
        if (curr[f] !== orig[f]) {
          dirtySet.add(empId);
          break;
        }
      }
    }
    return dirtySet;
  }, [entries, originalEntries]);

  const handleChange = useCallback(
    (empId: string, field: MetricFields, value: string) => {
      const num = Math.max(0, parseInt(value) || 0);
      setEntries((prev) => ({
        ...prev,
        [empId]: { ...prev[empId], [field]: num },
      }));
    },
    []
  );

  const handleNavigate = useCallback(
    (newDate: string) => {
      if (dirty.size > 0 && !confirm("You have unsaved changes. Discard?")) {
        return;
      }
      startNavigation(() => {
        router.push(`/daily-logs?date=${newDate}`);
      });
    },
    [dirty, router, startNavigation]
  );

  const handleSave = () => {
    if (dirty.size === 0) return;

    const changedEntries = Array.from(dirty).map((empId) => ({
      employee_id: empId,
      ...entries[empId],
    }));

    // Snapshot what we're saving as the new baseline
    const savedSnapshot: Record<string, EntryValues> = {};
    for (const empId of dirty) {
      savedSnapshot[empId] = { ...entries[empId] };
    }

    startSaveTransition(async () => {
      const result = await saveDailyMetrics({ date, entries: changedEntries });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success(`Saved daily data for ${changedEntries.length} employee(s)`);
      setOriginalEntries((prev) => ({ ...prev, ...savedSnapshot }));
    });
  };

  const today = toLocalDateString(new Date());
  const isBusy = isSaving || isNavigating;

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3 transition-shadow duration-300 hover:shadow-md">
        <div className="relative flex-1 max-w-sm min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search employees..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => handleNavigate(shiftDate(date, -1))}
              disabled={isBusy}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    className="gap-2 px-3"
                    disabled={isBusy}
                  />
                }
              >
                <CalendarDays className="h-4 w-4 text-primary/60" />
                {isNavigating ? (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading&hellip;
                  </span>
                ) : (
                  <span className="font-medium">{formatShortDate(date)}</span>
                )}
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 shadow-lg" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(day) => {
                    if (day) {
                      setCalendarOpen(false);
                      handleNavigate(toLocalDateString(day));
                    }
                  }}
                  defaultMonth={selectedDate}
                />
              </PopoverContent>
            </Popover>

            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => handleNavigate(shiftDate(date, 1))}
              disabled={isBusy}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            {date !== today && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleNavigate(today)}
                disabled={isBusy}
              >
                Today
              </Button>
            )}
          </div>

          {canEdit && dirty.size > 0 && (
            <Button onClick={handleSave} disabled={isBusy} size="sm" className="shadow-sm">
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {isSaving ? "Saving..." : `Save Changes (${dirty.size})`}
            </Button>
          )}
        </div>
      </div>

      {/* ── Data Grid ── */}
      <Card className={`border-0 py-0 gap-0 shadow-sm ring-1 ring-border/50 overflow-hidden transition-shadow duration-300 hover:shadow-md ${isNavigating ? "opacity-50 pointer-events-none" : ""}`}>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[calc(100vh-16rem)]">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800">
                <tr className="border-b border-border/60">
                  <th
                    className="text-left p-3 text-sm font-semibold text-slate-700 dark:text-slate-300 tracking-wide sticky left-0 bg-slate-100 dark:bg-slate-800 z-30"
                    rowSpan={2}
                  >
                    Employee
                  </th>
                  <th
                    className="text-center px-2 pt-3 pb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300 tracking-wide border-l border-border/40 bg-slate-100 dark:bg-slate-800"
                    colSpan={2}
                  >
                    Calls
                  </th>
                  <th
                    className="text-center px-2 pt-3 pb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300 tracking-wide border-l border-border/40 bg-slate-100 dark:bg-slate-800"
                    colSpan={2}
                  >
                    Arch. Meetings
                  </th>
                  <th
                    className="text-center px-2 pt-3 pb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300 tracking-wide border-l border-border/40 bg-slate-100 dark:bg-slate-800"
                    colSpan={2}
                  >
                    Client Meetings
                  </th>
                  <th
                    className="text-center px-2 pt-3 pb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300 tracking-wide border-l border-border/40 bg-slate-100 dark:bg-slate-800"
                    colSpan={2}
                  >
                    Site Visits
                  </th>
                </tr>
                <tr className="border-b border-border/60">
                  <th className="text-center px-1.5 py-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 border-l border-border/40 bg-slate-200/70 dark:bg-slate-700/50">
                    Target
                  </th>
                  <th className="text-center px-1.5 py-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800">
                    Actual
                  </th>
                  <th className="text-center px-1.5 py-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 border-l border-border/40 bg-slate-200/70 dark:bg-slate-700/50">
                    Target
                  </th>
                  <th className="text-center px-1.5 py-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800">
                    Actual
                  </th>
                  <th className="text-center px-1.5 py-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 border-l border-border/40 bg-slate-200/70 dark:bg-slate-700/50">
                    Target
                  </th>
                  <th className="text-center px-1.5 py-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800">
                    Actual
                  </th>
                  <th className="text-center px-1.5 py-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 border-l border-border/40 bg-slate-200/70 dark:bg-slate-700/50">
                    Target
                  </th>
                  <th className="text-center px-1.5 py-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800">
                    Actual
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp) => (
                  <EmployeeRow
                    key={emp.id}
                    employee={emp}
                    values={entries[emp.id]}
                    isDirty={dirty.has(emp.id)}
                    canEditTargets={canEditTargets}
                    canEdit={canEdit}
                    onChange={handleChange}
                  />
                ))}
                {filteredEmployees.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-16">
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex size-12 items-center justify-center rounded-full bg-muted/60">
                          <CalendarDays className="h-6 w-6 text-muted-foreground/80" />
                        </div>
                        <div className="space-y-1 text-center">
                          <p className="text-sm font-medium text-foreground/70">
                            {searchFilter ? "No employees match your search" : "No active employees found"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {searchFilter
                              ? "Try adjusting your search."
                              : "Add employees first to start logging daily metrics."}
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Legend ── */}
      {canEdit && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm bg-amber-100 border border-amber-300 dark:bg-amber-950/40 dark:border-amber-800" />
            <span>Unsaved changes</span>
          </div>
          <span>&middot;</span>
          <span>Target columns (super admin only) &middot; Actual columns</span>
          <span>&middot;</span>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm bg-emerald-50 border border-emerald-300" />
            <span>&ge;90%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm bg-amber-50 border border-amber-300" />
            <span>70–89%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm bg-red-50 border border-red-300" />
            <span>&lt;70%</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Employee Row ── */

const METRICS: {
  target: MetricFields;
  actual: MetricFields;
}[] = [
  { target: "target_calls", actual: "actual_calls" },
  { target: "target_architect_meetings", actual: "actual_architect_meetings" },
  { target: "target_client_meetings", actual: "actual_client_meetings" },
  { target: "target_site_visits", actual: "actual_site_visits" },
];

function EmployeeRow({
  employee,
  values,
  isDirty,
  canEditTargets,
  canEdit,
  onChange,
}: {
  employee: Employee;
  values: EntryValues;
  isDirty: boolean;
  canEditTargets: boolean;
  canEdit: boolean;
  onChange: (empId: string, field: MetricFields, value: string) => void;
}) {
  return (
    <tr
      className={`border-b border-border/40 transition-colors ${
        isDirty
          ? "bg-amber-50/70 dark:bg-amber-950/20"
          : "hover:bg-muted/20"
      }`}
    >
      <td className="p-3 sticky left-0 bg-inherit z-10">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${getAvatarColor(employee.name)}`}
          >
            {getInitials(employee.name)}
          </div>
          <div className="min-w-0">
            <div className="font-medium whitespace-nowrap leading-tight">{employee.name}</div>
            <div className="text-[11px] text-muted-foreground leading-tight">{employee.emp_id}</div>
          </div>
          {isDirty && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-amber-600 border-amber-300">
              edited
            </Badge>
          )}
        </div>
      </td>
      {METRICS.map((m) => (
        <MetricCells
          key={m.target}
          empId={employee.id}
          targetField={m.target}
          actualField={m.actual}
          targetValue={values[m.target]}
          actualValue={values[m.actual]}
          canEditTargets={canEditTargets}
          canEdit={canEdit}
          onChange={onChange}
        />
      ))}
    </tr>
  );
}

/* ── Metric Input Cells ── */

function MetricCells({
  empId,
  targetField,
  actualField,
  targetValue,
  actualValue,
  canEditTargets,
  canEdit,
  onChange,
}: {
  empId: string;
  targetField: MetricFields;
  actualField: MetricFields;
  targetValue: number;
  actualValue: number;
  canEditTargets: boolean;
  canEdit: boolean;
  onChange: (empId: string, field: MetricFields, value: string) => void;
}) {
  const inputBase =
    "h-8 w-16 block mx-auto text-sm px-1 [text-align:center] border-transparent bg-transparent rounded-md transition-colors hover:border-border/60 hover:bg-white focus-visible:bg-white focus-visible:border-primary/30 focus-visible:ring-2 focus-visible:ring-primary/15 disabled:hover:border-transparent disabled:hover:bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  // Achievement color for actual value cells
  let actualCellBg = "";
  let actualTextColor = "";
  if (targetValue > 0 && actualValue > 0) {
    const ratio = actualValue / targetValue;
    if (ratio >= 0.9) {
      actualCellBg = "bg-emerald-50/60 dark:bg-emerald-950/20";
      actualTextColor = "font-medium text-emerald-700 dark:text-emerald-400";
    } else if (ratio >= 0.7) {
      actualCellBg = "bg-amber-50/60 dark:bg-amber-950/20";
      actualTextColor = "font-medium text-amber-700 dark:text-amber-400";
    } else {
      actualCellBg = "bg-red-50/50 dark:bg-red-950/20";
      actualTextColor = "font-medium text-red-600 dark:text-red-400";
    }
  }

  return (
    <>
      <td className="px-1 py-1.5 border-l border-border/40 bg-muted/20">
        <Input
          type="number"
          min={0}
          value={targetValue || ""}
          onChange={(e) => onChange(empId, targetField, e.target.value)}
          disabled={!canEditTargets}
          className={inputBase}
          placeholder="0"
        />
      </td>
      <td className={`px-1 py-1.5 transition-colors ${actualCellBg}`}>
        <Input
          type="number"
          min={0}
          value={actualValue || ""}
          onChange={(e) => onChange(empId, actualField, e.target.value)}
          disabled={!canEdit}
          className={`${inputBase} ${actualTextColor}`}
          placeholder="0"
        />
      </td>
    </>
  );
}
