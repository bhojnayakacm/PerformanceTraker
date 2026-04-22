"use client";

import { useState, useEffect, useTransition, useCallback, useMemo, useRef } from "react";
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

type EntryValues = Record<MetricFields, number> & { remarks: string };

const EMPTY_ENTRY: EntryValues = {
  target_calls: 0,
  target_total_meetings: 0,
  actual_calls: 0,
  actual_architect_meetings: 0,
  actual_client_meetings: 0,
  actual_site_visits: 0,
  remarks: "",
};

type Props = {
  employees: Employee[];
  initialData: Record<string, DailyMetric>;
  date: string;
  userRole: UserRole;
};

/* ── Helpers ── */

function toEntryValues(dm: DailyMetric | undefined | null): EntryValues {
  if (!dm) return { ...EMPTY_ENTRY };
  return {
    target_calls: dm.target_calls ?? 0,
    target_total_meetings: dm.target_total_meetings ?? 0,
    actual_calls: dm.actual_calls ?? 0,
    actual_architect_meetings: dm.actual_architect_meetings ?? 0,
    actual_client_meetings: dm.actual_client_meetings ?? 0,
    actual_site_visits: dm.actual_site_visits ?? 0,
    remarks: dm.remarks ?? "",
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

// Literal full class strings — Tailwind v4 source-scanning must see them verbatim.
// `!` important prefix ensures cell bg wins over <tr>-level backgrounds.
const TIER_CLASSES = {
  success: {
    bg: "!bg-emerald-100 dark:!bg-emerald-950/40",
    text: "font-semibold text-emerald-800 dark:text-emerald-300",
  },
  warning: {
    bg: "!bg-yellow-100 dark:!bg-yellow-950/40",
    text: "font-semibold text-yellow-800 dark:text-yellow-300",
  },
  danger: {
    bg: "!bg-red-100 dark:!bg-red-950/40",
    text: "font-semibold text-red-700 dark:text-red-300",
  },
  none: { bg: "", text: "" },
} as const;

function getAchievementColors(
  target: number,
  actual: number
): { bg: string; text: string } {
  const t = Number(target) || 0;
  const a = Number(actual) || 0;
  if (t <= 0 || a <= 0) return TIER_CLASSES.none;
  const ratio = a / t;
  if (ratio >= 0.9) return TIER_CLASSES.success;
  if (ratio >= 0.7) return TIER_CLASSES.warning;
  return TIER_CLASSES.danger;
}

/* ── Column-resize hook ── */

type ResizableKey = "employee" | "metrics";

function useColumnResize(initial: Record<ResizableKey, number>) {
  const [widths, setWidths] = useState(initial);
  const [draggingKey, setDraggingKey] = useState<ResizableKey | null>(null);
  const widthsRef = useRef(widths);
  widthsRef.current = widths;
  const active = useRef<{
    key: ResizableKey;
    startX: number;
    startWidth: number;
    minWidth: number;
  } | null>(null);

  const onResizeStart = useCallback(
    (
      key: ResizableKey,
      e: React.PointerEvent<HTMLElement>,
      minWidth = 120
    ) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      active.current = {
        key,
        startX: e.clientX,
        startWidth: widthsRef.current[key],
        minWidth,
      };
      setDraggingKey(key);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    []
  );

  const onResizeMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!active.current) return;
    const { key, startX, startWidth, minWidth } = active.current;
    const next = Math.max(
      minWidth,
      Math.round(startWidth + (e.clientX - startX))
    );
    setWidths((prev) =>
      prev[key] === next ? prev : { ...prev, [key]: next }
    );
  }, []);

  const onResizeEnd = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!active.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    active.current = null;
    setDraggingKey(null);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  return { widths, draggingKey, onResizeStart, onResizeMove, onResizeEnd };
}

/**
 * Thin invisible divider at the right edge of a header cell; turns indigo on hover/drag.
 * Pass `height` (pixels) to override the default 100%-of-parent behavior — needed when
 * the handle sits in a `<th>` that only spans one row of a multi-row thead.
 */
function ResizeHandle({
  onStart,
  onMove,
  onEnd,
  label,
  height,
  isDragging = false,
}: {
  onStart: (e: React.PointerEvent<HTMLSpanElement>) => void;
  onMove: (e: React.PointerEvent<HTMLSpanElement>) => void;
  onEnd: (e: React.PointerEvent<HTMLSpanElement>) => void;
  label: string;
  height?: number;
  isDragging?: boolean;
}) {
  return (
    <span
      suppressHydrationWarning
      onPointerDown={onStart}
      onPointerMove={onMove}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      style={{ height: height ?? "100%" }}
      className={`absolute top-0 right-0 z-40 w-1.5 translate-x-1/2 cursor-col-resize select-none touch-none transition-colors ${
        isDragging
          ? "bg-indigo-600"
          : "bg-transparent hover:bg-indigo-500/70"
      }`}
    />
  );
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
  const canEditTargets = userRole === "super_admin" || userRole === "manager";
  const canEdit = userRole !== "viewer";

  // Two resizable major columns: Employee, and the Meetings+Calls "metrics" block.
  // Remarks is the flex-fill trailing column.
  const {
    widths: colWidths,
    draggingKey,
    onResizeStart,
    onResizeMove,
    onResizeEnd,
  } = useColumnResize({ employee: 260, metrics: 660 });
  const REMARKS_MIN_WIDTH = 280;
  const tableMinWidth =
    colWidths.employee + colWidths.metrics + REMARKS_MIN_WIDTH;

  // Measure thead height so the "metrics" handle (inside a single-row <th>) can
  // span both header rows and match the Employee handle's visual height.
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const [theadHeight, setTheadHeight] = useState(80);
  useEffect(() => {
    const el = theadRef.current;
    if (!el) return;
    const update = () => setTheadHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
    const fields = Object.keys(EMPTY_ENTRY) as (keyof EntryValues)[];
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
        [empId]: { ...(prev[empId] ?? EMPTY_ENTRY), [field]: num },
      }));
    },
    []
  );

  const handleRemarkChange = useCallback(
    (empId: string, value: string) => {
      setEntries((prev) => ({
        ...prev,
        [empId]: { ...(prev[empId] ?? EMPTY_ENTRY), remarks: value },
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
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* ── Toolbar ── */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_0_rgba(15,23,42,0.04)] transition-all duration-200 hover:shadow-[0_4px_16px_-6px_rgba(79,70,229,0.15)]">
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
        className={`flex-1 min-h-0 flex flex-col border-0 py-0 gap-0 rounded-2xl bg-white ring-1 ring-slate-200 shadow-[0_4px_24px_-12px_rgba(79,70,229,0.12)] overflow-hidden transition-all duration-200 hover:shadow-[0_6px_28px_-10px_rgba(79,70,229,0.18)] ${isNavigating ? "opacity-50 pointer-events-none" : ""}`}
      >
        <CardContent className="flex-1 min-h-0 flex flex-col p-0">
          <div className="flex-1 min-h-0 overflow-auto">
            <table
              className="w-full border-collapse text-sm"
              style={{ tableLayout: "fixed", minWidth: tableMinWidth }}
            >
              <colgroup>
                <col style={{ width: colWidths.employee }} />
                <col style={{ width: Math.round(colWidths.metrics / 6) }} />
                <col style={{ width: Math.round(colWidths.metrics / 6) }} />
                <col style={{ width: Math.round(colWidths.metrics / 6) }} />
                <col style={{ width: Math.round(colWidths.metrics / 6) }} />
                <col style={{ width: Math.round(colWidths.metrics / 6) }} />
                <col style={{ width: Math.round(colWidths.metrics / 6) }} />
                <col />
              </colgroup>
              <thead ref={theadRef} className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800">
                {/* Group headers */}
                <tr>
                  <th
                    className="text-left p-3 text-sm font-semibold text-slate-700 dark:text-slate-300 tracking-wide sticky left-0 bg-slate-100 dark:bg-slate-800 z-30 border-r-2 border-r-slate-300 dark:border-r-slate-600 border-b-2 border-b-slate-300 dark:border-b-slate-600"
                    rowSpan={2}
                  >
                    Employee
                    {mounted && (
                      <ResizeHandle
                        onStart={(e) => onResizeStart("employee", e, 180)}
                        onMove={onResizeMove}
                        onEnd={onResizeEnd}
                        label="Resize Employee column"
                        isDragging={draggingKey === "employee"}
                      />
                    )}
                  </th>
                  <th
                    className="text-center px-2 pt-3 pb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300 tracking-wide border-r-2 border-r-slate-300 dark:border-r-slate-600 border-b border-b-slate-200 dark:border-b-slate-700 bg-slate-100 dark:bg-slate-800"
                    colSpan={4}
                  >
                    Meetings
                  </th>
                  <th
                    className="relative text-center px-2 pt-3 pb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300 tracking-wide border-r-2 border-r-slate-300 dark:border-r-slate-600 border-b border-b-slate-200 dark:border-b-slate-700 bg-slate-100 dark:bg-slate-800"
                    colSpan={2}
                  >
                    Calls
                    {mounted && (
                      <ResizeHandle
                        onStart={(e) => onResizeStart("metrics", e, 480)}
                        onMove={onResizeMove}
                        onEnd={onResizeEnd}
                        label="Resize Meetings and Calls columns"
                        height={theadHeight}
                        isDragging={draggingKey === "metrics"}
                      />
                    )}
                  </th>
                  <th
                    className="text-center px-2 pt-3 pb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300 tracking-wide bg-slate-100 dark:bg-slate-800 border-b-2 border-b-slate-300 dark:border-b-slate-600"
                    rowSpan={2}
                  >
                    Remarks
                  </th>
                </tr>
                {/* Sub-headers */}
                <tr>
                  <th className="text-center px-1.5 py-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 bg-slate-200/70 dark:bg-slate-700/50 border-r border-r-slate-200 dark:border-r-slate-700 border-b-2 border-b-slate-300 dark:border-b-slate-600">
                    Target
                  </th>
                  <th className="text-center px-1.5 py-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-r border-r-slate-200 dark:border-r-slate-700 border-b-2 border-b-slate-300 dark:border-b-slate-600">
                    Architect
                  </th>
                  <th className="text-center px-1.5 py-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-r border-r-slate-200 dark:border-r-slate-700 border-b-2 border-b-slate-300 dark:border-b-slate-600">
                    Client
                  </th>
                  <th className="text-center px-1.5 py-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-r-2 border-r-slate-300 dark:border-r-slate-600 border-b-2 border-b-slate-300 dark:border-b-slate-600">
                    Site Visits
                  </th>
                  <th className="text-center px-1.5 py-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 bg-slate-200/70 dark:bg-slate-700/50 border-r border-r-slate-200 dark:border-r-slate-700 border-b-2 border-b-slate-300 dark:border-b-slate-600">
                    Target
                  </th>
                  <th className="text-center px-1.5 py-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-r-2 border-r-slate-300 dark:border-r-slate-600 border-b-2 border-b-slate-300 dark:border-b-slate-600">
                    Actual
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp) => (
                  <EmployeeRow
                    key={emp.id}
                    employee={emp}
                    values={entries[emp.id] ?? EMPTY_ENTRY}
                    isDirty={dirty.has(emp.id)}
                    canEditTargets={canEditTargets}
                    canEdit={canEdit}
                    onChange={handleChange}
                    onRemarkChange={handleRemarkChange}
                  />
                ))}
                {filteredEmployees.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-16">
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
  onRemarkChange,
}: {
  employee: Employee;
  values: EntryValues;
  isDirty: boolean;
  canEditTargets: boolean;
  canEdit: boolean;
  onChange: (empId: string, field: MetricFields, value: string) => void;
  onRemarkChange: (empId: string, value: string) => void;
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
      <td className="p-3 sticky left-0 bg-inherit z-10 border-r-2 border-r-slate-300 dark:border-r-slate-600">
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
            <div className="truncate text-[11px] text-muted-foreground leading-tight">
              {employee.emp_id}
              {employee.location ? (
                <>
                  <span aria-hidden className="mx-1.5 text-muted-foreground/60">
                    &bull;
                  </span>
                  {employee.location}
                </>
              ) : null}
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

      {/* Meetings Target (single combined target) */}
      <td className="px-1 py-1.5 bg-muted/20 border-r border-r-slate-200 dark:border-r-slate-700">
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
      <td className={`px-1 py-1.5 transition-colors border-r border-r-slate-200 dark:border-r-slate-700 ${meetingsColors.bg}`}>
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
      <td className={`px-1 py-1.5 transition-colors border-r border-r-slate-200 dark:border-r-slate-700 ${meetingsColors.bg}`}>
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
      <td className={`px-1 py-1.5 transition-colors border-r-2 border-r-slate-300 dark:border-r-slate-600 ${meetingsColors.bg}`}>
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

      {/* Calls Target */}
      <td className="px-1 py-1.5 bg-muted/20 border-r border-r-slate-200 dark:border-r-slate-700">
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
      <td className={`px-1 py-1.5 transition-colors border-r-2 border-r-slate-300 dark:border-r-slate-600 ${callsColors.bg}`}>
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

      {/* Remarks */}
      <td className="px-1 py-1.5">
        <Input
          id={`remarks-${employee.id}`}
          type="text"
          value={values.remarks}
          onChange={(e) => onRemarkChange(employee.id, e.target.value)}
          disabled={!canEdit}
          className={`${INPUT_BASE} !w-full text-left px-2 [text-align:left]`}
          placeholder="Add note..."
        />
      </td>
    </tr>
  );
}
