"use client";

import { useState, useEffect, useTransition, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Save,
  Loader2,
  Search,
  Target,
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
import { BulkTargetsDialog } from "./bulk-targets-dialog";

/* ── Types ── */

type MetricFields =
  | "target_calls"
  | "target_total_meetings"
  | "actual_calls"
  | "actual_architect_meetings"
  | "actual_client_meetings"
  | "actual_site_visits";

type EntryValues = Record<MetricFields, number>;

const EMPTY_ENTRY: EntryValues = {
  target_calls: 0,
  target_total_meetings: 0,
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
    target_total_meetings: dm.target_total_meetings,
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

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatShortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return `${SHORT_DAYS[dow]}, ${d} ${LONG_MONTHS[m - 1]} ${y}`;
}

function getAchievementColors(
  target: number,
  actual: number
): { bg: string; text: string } {
  if (target <= 0 || actual <= 0) return { bg: "", text: "" };
  const ratio = actual / target;
  if (ratio >= 0.9)
    return {
      bg: "bg-emerald-50/60 dark:bg-emerald-950/20",
      text: "font-medium text-emerald-700 dark:text-emerald-400",
    };
  if (ratio >= 0.7)
    return {
      bg: "bg-amber-50/60 dark:bg-amber-950/20",
      text: "font-medium text-amber-700 dark:text-amber-400",
    };
  return {
    bg: "bg-red-50/50 dark:bg-red-950/20",
    text: "font-medium text-red-600 dark:text-red-400",
  };
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
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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

  // Re-sync local state when server data refreshes (e.g. after bulk targets)
  useEffect(() => {
    const init: Record<string, EntryValues> = {};
    for (const emp of employees) {
      init[emp.id] = toEntryValues(initialData[emp.id]);
    }
    setOriginalEntries(init);
    setEntries(init);
  }, [initialData, employees]);

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

      toast.success(
        `Saved daily data for ${changedEntries.length} employee(s)`
      );
      setOriginalEntries((prev) => ({ ...prev, ...savedSnapshot }));
    });
  };

  const today = toLocalDateString(new Date());
  const isBusy = isSaving || isNavigating;

  // Extract month/year for the bulk targets dialog defaults
  const [dateYear, dateMonth] = date.split("-").map(Number);

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3 transition-shadow duration-300 hover:shadow-md">
        <div className="relative flex-1 max-w-sm min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="daily-logs-search-input"
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
                    id="daily-logs-date-trigger"
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

            {mounted && date !== today && (
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

          {canEditTargets && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkDialogOpen(true)}
              disabled={isBusy}
            >
              <Target className="mr-2 h-4 w-4" />
              Set Targets
            </Button>
          )}

          {canEdit && dirty.size > 0 && (
            <Button
              onClick={handleSave}
              disabled={isBusy}
              size="sm"
              className="shadow-sm"
            >
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
      <Card
        className={`border-0 py-0 gap-0 shadow-sm ring-1 ring-border/50 overflow-hidden transition-shadow duration-300 hover:shadow-md ${isNavigating ? "opacity-50 pointer-events-none" : ""}`}
      >
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[calc(100vh-16rem)]">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800">
                {/* Group headers */}
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
                    colSpan={4}
                  >
                    Meetings
                  </th>
                </tr>
                {/* Sub-headers */}
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
                    Architect
                  </th>
                  <th className="text-center px-1.5 py-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800">
                    Client
                  </th>
                  <th className="text-center px-1.5 py-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800">
                    Site Visits
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
                    <td colSpan={7} className="py-16">
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex size-12 items-center justify-center rounded-full bg-muted/60">
                          <CalendarDays className="h-6 w-6 text-muted-foreground/80" />
                        </div>
                        <div className="space-y-1 text-center">
                          <p className="text-sm font-medium text-foreground/70">
                            {searchFilter
                              ? "No employees match your search"
                              : "No active employees found"}
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
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm bg-amber-100 border border-amber-300 dark:bg-amber-950/40 dark:border-amber-800" />
            <span>Unsaved changes</span>
          </div>
          <span>&middot;</span>
          <span>
            Target columns (super admin only) &middot; Actual columns
          </span>
          <span>&middot;</span>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm bg-emerald-50 border border-emerald-300" />
            <span>&ge;90%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm bg-amber-50 border border-amber-300" />
            <span>70&ndash;89%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm bg-red-50 border border-red-300" />
            <span>&lt;70%</span>
          </div>
        </div>
      )}

      {/* ── Bulk Targets Dialog ── */}
      <BulkTargetsDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        employees={employees}
        defaultMonth={dateMonth}
        defaultYear={dateYear}
      />
    </div>
  );
}

/* ── Employee Row ── */

const INPUT_BASE =
  "h-8 w-16 block mx-auto text-sm px-1 [text-align:center] border-transparent bg-transparent rounded-md transition-colors hover:border-border/60 hover:bg-white focus-visible:bg-white focus-visible:border-primary/30 focus-visible:ring-2 focus-visible:ring-primary/15 disabled:hover:border-transparent disabled:hover:bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

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
  // Calls achievement
  const callsColors = getAchievementColors(
    values.target_calls,
    values.actual_calls
  );

  // Meetings achievement (combined: sum of 3 actuals vs single target)
  const meetingsTotal =
    values.actual_architect_meetings +
    values.actual_client_meetings +
    values.actual_site_visits;
  const meetingsColors = getAchievementColors(
    values.target_total_meetings,
    meetingsTotal
  );

  return (
    <tr
      className={`border-b border-border/40 transition-colors ${
        isDirty
          ? "bg-amber-50/70 dark:bg-amber-950/20"
          : "hover:bg-muted/20"
      }`}
    >
      {/* Employee */}
      <td className="p-3 sticky left-0 bg-inherit z-10">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${getAvatarColor(employee.name)}`}
          >
            {getInitials(employee.name)}
          </div>
          <div className="min-w-0">
            <div className="font-medium whitespace-nowrap leading-tight">
              {employee.name}
            </div>
            <div className="text-[11px] text-muted-foreground leading-tight">
              {employee.emp_id}
            </div>
          </div>
          {isDirty && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 h-4 text-amber-600 border-amber-300"
            >
              edited
            </Badge>
          )}
        </div>
      </td>

      {/* Calls Target */}
      <td className="px-1 py-1.5 border-l border-border/40 bg-muted/20">
        <Input
          id={`target-calls-${employee.id}`}
          type="number"
          min={0}
          value={values.target_calls || ""}
          onChange={(e) =>
            onChange(employee.id, "target_calls", e.target.value)
          }
          disabled={!canEditTargets}
          className={INPUT_BASE}
          placeholder="0"
        />
      </td>

      {/* Calls Actual */}
      <td className={`px-1 py-1.5 transition-colors ${callsColors.bg}`}>
        <Input
          id={`actual-calls-${employee.id}`}
          type="number"
          min={0}
          value={values.actual_calls || ""}
          onChange={(e) =>
            onChange(employee.id, "actual_calls", e.target.value)
          }
          disabled={!canEdit}
          className={`${INPUT_BASE} ${callsColors.text}`}
          placeholder="0"
        />
      </td>

      {/* Meetings Target (single combined target) */}
      <td className="px-1 py-1.5 border-l border-border/40 bg-muted/20">
        <Input
          id={`target-meetings-${employee.id}`}
          type="number"
          min={0}
          value={values.target_total_meetings || ""}
          onChange={(e) =>
            onChange(employee.id, "target_total_meetings", e.target.value)
          }
          disabled={!canEditTargets}
          className={INPUT_BASE}
          placeholder="0"
        />
      </td>

      {/* Architect Meetings Actual */}
      <td className={`px-1 py-1.5 transition-colors ${meetingsColors.bg}`}>
        <Input
          id={`actual-architect-${employee.id}`}
          type="number"
          min={0}
          value={values.actual_architect_meetings || ""}
          onChange={(e) =>
            onChange(
              employee.id,
              "actual_architect_meetings",
              e.target.value
            )
          }
          disabled={!canEdit}
          className={`${INPUT_BASE} ${meetingsColors.text}`}
          placeholder="0"
        />
      </td>

      {/* Client Meetings Actual */}
      <td className={`px-1 py-1.5 transition-colors ${meetingsColors.bg}`}>
        <Input
          id={`actual-client-${employee.id}`}
          type="number"
          min={0}
          value={values.actual_client_meetings || ""}
          onChange={(e) =>
            onChange(employee.id, "actual_client_meetings", e.target.value)
          }
          disabled={!canEdit}
          className={`${INPUT_BASE} ${meetingsColors.text}`}
          placeholder="0"
        />
      </td>

      {/* Site Visits Actual */}
      <td className={`px-1 py-1.5 transition-colors ${meetingsColors.bg}`}>
        <Input
          id={`actual-site-visits-${employee.id}`}
          type="number"
          min={0}
          value={values.actual_site_visits || ""}
          onChange={(e) =>
            onChange(employee.id, "actual_site_visits", e.target.value)
          }
          disabled={!canEdit}
          className={`${INPUT_BASE} ${meetingsColors.text}`}
          placeholder="0"
        />
      </td>
    </tr>
  );
}
