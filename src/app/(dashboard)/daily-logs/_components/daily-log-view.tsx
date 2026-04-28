"use client";

import { useState, useEffect, useTransition, useCallback, useMemo, useRef, memo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import {
  ArrowUpDown,
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
import {
  DndTableProvider,
  DragHandleCell,
  DragHandleHeader,
  RowDragPreview,
  SortableRow,
  useTableDnD,
} from "@/components/data-table/sortable-table";
import type { Employee, UserRole, DailyMetric } from "@/lib/types";
import { cn, getInitials, getAvatarColor } from "@/lib/utils";
import { saveDailyMetrics } from "../actions";
import { BulkTargetsDialog } from "./bulk-targets-dialog";

const DAILY_LOGS_ORDER_KEY = "daily_logs_custom_order";

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

/**
 * Color tier for a (target, actual) pair on a specific day.
 *
 * Sparse-data rule: on a past or today date where a target is set but
 * the actual is 0 / null / unlogged, performance is mathematically 0% —
 * so the cell must render in the danger tier. Future days are never
 * colored regardless of values, so we don't red-shame days that haven't
 * happened yet.
 */
function getAchievementColors(
  target: number,
  actual: number,
  isPastOrToday: boolean
): { bg: string; text: string } {
  if (!isPastOrToday) return TIER_CLASSES.none;
  const t = Number(target) || 0;
  if (t <= 0) return TIER_CLASSES.none; // no target → no comparison
  const a = Number(actual) || 0;
  if (a <= 0) return TIER_CLASSES.danger; // target set, nothing logged → 0%
  const ratio = a / t;
  if (ratio >= 0.9) return TIER_CLASSES.success;
  if (ratio >= 0.7) return TIER_CLASSES.warning;
  return TIER_CLASSES.danger;
}

/* ── Column-resize hook ── */

type ResizableKey = "employee" | "metrics";

/**
 * PERF: This hook intentionally does NOT call setState during a resize drag
 * (the original implementation did, and that's what was pegging the main
 * thread to "Page Unresponsive" with 100+ employee rows on screen).
 *
 * Instead, the move handler writes a CSS variable directly onto the <table>
 * element via a ref. Browsers repaint column widths from CSS vars without
 * any React reconciliation work — same speed as a hardware-accelerated
 * transform. State is committed exactly once, on pointer-up — same semantics
 * as TanStack's `columnResizeMode: 'onEnd'`.
 *
 * Consumers wire the returned `tableRef` onto their <table> and read CSS
 * vars in their <col> and minWidth styles.
 */
function useColumnResize(initial: Record<ResizableKey, number>) {
  const [widths, setWidths] = useState(initial);
  const [draggingKey, setDraggingKey] = useState<ResizableKey | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const widthsRef = useRef(widths);
  widthsRef.current = widths;
  const active = useRef<{
    key: ResizableKey;
    startX: number;
    startWidth: number;
    minWidth: number;
    currentWidth: number;
  } | null>(null);

  // PERF: requestAnimationFrame throttle. A high-refresh mouse fires
  // pointermove at 144Hz; each browser layout pass on a 50-row table is
  // 5–10ms. Without throttling the queue of pending layouts overruns the
  // frame budget, the main thread can't drain it, and the browser raises
  // "Page Unresponsive". RAF coalesces to one DOM write per frame, capping
  // layout work at the display's refresh rate.
  const rafIdRef = useRef<number | null>(null);
  const pendingRef = useRef<{ key: ResizableKey; width: number } | null>(null);

  const flushPending = useCallback(() => {
    rafIdRef.current = null;
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    tableRef.current?.style.setProperty(
      `--col-${pending.key}-w`,
      `${pending.width}px`,
    );
  }, []);

  const onResizeStart = useCallback(
    (
      key: ResizableKey,
      e: React.PointerEvent<HTMLElement>,
      minWidth = 120
    ) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const startWidth = widthsRef.current[key];
      active.current = {
        key,
        startX: e.clientX,
        startWidth,
        minWidth,
        currentWidth: startWidth,
      };
      setDraggingKey(key);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    []
  );

  // Queues a DOM write — does NOT call setState and does NOT touch the DOM
  // synchronously. The actual style mutation happens on the next animation
  // frame via `flushPending`.
  const onResizeMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!active.current) return;
      const { key, startX, startWidth, minWidth } = active.current;
      const next = Math.max(
        minWidth,
        Math.round(startWidth + (e.clientX - startX)),
      );
      if (active.current.currentWidth === next) return;
      active.current.currentWidth = next;
      pendingRef.current = { key, width: next };
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(flushPending);
      }
    },
    [flushPending],
  );

  const onResizeEnd = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!active.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    // Drain any RAF-pending write before committing React state so the
    // inline style React sets on the next render matches the DOM.
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (pendingRef.current) {
      tableRef.current?.style.setProperty(
        `--col-${pendingRef.current.key}-w`,
        `${pendingRef.current.width}px`,
      );
      pendingRef.current = null;
    }
    const { key, currentWidth } = active.current;
    setWidths((prev) =>
      prev[key] === currentWidth ? prev : { ...prev, [key]: currentWidth }
    );
    active.current = null;
    setDraggingKey(null);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  // Cleanup any pending RAF on unmount.
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  return {
    widths,
    draggingKey,
    tableRef,
    onResizeStart,
    onResizeMove,
    onResizeEnd,
  };
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
  const searchParams = useSearchParams();
  const [isSaving, startSaveTransition] = useTransition();
  const [isNavigating, startNavigation] = useTransition();
  const canEditTargets = userRole === "super_admin" || userRole === "manager";
  const canEdit = userRole !== "viewer";

  // Two resizable major columns: Employee, and the Meetings+Calls "metrics" block.
  // Remarks is the flex-fill trailing column.
  const {
    widths: colWidths,
    draggingKey,
    tableRef,
    onResizeStart,
    onResizeMove,
    onResizeEnd,
  } = useColumnResize({ employee: 260, metrics: 660 });
  const REMARKS_MIN_WIDTH = 280;
  const DRAG_HANDLE_WIDTH = 40;

  // Measure thead height once on mount so the "metrics" resize handle (which
  // lives in a single-row <th>) can span both header rows.
  //
  // PERF: We deliberately do NOT use a ResizeObserver here. A live observer
  // creates a layout-feedback loop: column resize → thead reflow → RO fires
  // → setState → re-render → potentially more reflow. With our CSS-var-based
  // resize the layout is stable (headers don't wrap), so a one-shot read
  // is enough. Window resize won't change thead height in any meaningful way.
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const [theadHeight, setTheadHeight] = useState(80);
  useEffect(() => {
    if (theadRef.current) setTheadHeight(theadRef.current.offsetHeight);
  }, []);

  const [calendarOpen, setCalendarOpen] = useState(false);
  // URL-backed search so the filter survives the key={date} remount
  // that happens whenever the user navigates to a different day.
  const { inputValue: searchFilter, setInputValue: setSearchFilter } =
    useDebouncedSearch("query", 300);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Apply persisted custom order BEFORE search filter so reordering survives
  // a typed-then-cleared search query, and so newly-fetched employees that
  // haven't been ordered yet get appended at the bottom by useTableDnD.
  const getEmpId = useCallback((emp: Employee) => emp.id, []);
  const { orderedData, rowIds, handleDragEnd, resetOrder, hasCustomOrder } =
    useTableDnD<Employee>({
      data: employees,
      storageKey: DAILY_LOGS_ORDER_KEY,
      getId: getEmpId,
    });

  const filteredEmployees = useMemo(() => {
    if (!searchFilter) return orderedData;
    const search = searchFilter.toLowerCase();
    return orderedData.filter(
      (emp) =>
        emp.name.toLowerCase().includes(search) ||
        emp.emp_id.toLowerCase().includes(search)
    );
  }, [orderedData, searchFilter]);

  // ── Sortable headers ──
  // Click-toggle: none → asc → desc → none. Sort uses `originalEntries`
  // (server snapshot) rather than the live draft, so row order doesn't
  // bounce around as the user types into target inputs.
  type SortField = "name" | "target_total_meetings" | "target_calls";
  const [sortConfig, setSortConfig] = useState<{
    field: SortField;
    dir: "asc" | "desc";
  } | null>(null);
  const isSorting = sortConfig !== null;

  const handleSort = useCallback((field: SortField) => {
    setSortConfig((prev) => {
      if (!prev || prev.field !== field) return { field, dir: "asc" };
      if (prev.dir === "asc") return { field, dir: "desc" };
      return null;
    });
  }, []);

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

  // Sorted view of filteredEmployees. When sort is active, the SortableRow's
  // `disabled` prop is set to true so users don't drag against an order that
  // would visually snap back on the next render.
  const sortedEmployees = useMemo(() => {
    if (!sortConfig) return filteredEmployees;
    const dir = sortConfig.dir === "asc" ? 1 : -1;
    const field = sortConfig.field;
    return [...filteredEmployees].sort((a, b) => {
      let cmp = 0;
      if (field === "name") {
        cmp = a.name.localeCompare(b.name);
      } else {
        cmp =
          (originalEntries[a.id]?.[field] ?? 0) -
          (originalEntries[b.id]?.[field] ?? 0);
      }
      return cmp * dir;
    });
  }, [filteredEmployees, sortConfig, originalEntries]);

  const handleResetOrder = useCallback(() => {
    setSortConfig(null);
    resetOrder();
  }, [resetOrder]);

  // O(1) lookup for the drag overlay — beats find() over orderedData when
  // dragOverlay re-renders.
  const employeeMap = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const emp of orderedData) map.set(emp.id, emp);
    return map;
  }, [orderedData]);

  const renderDragOverlay = useCallback(
    (activeId: string) => {
      const emp = employeeMap.get(activeId);
      if (!emp) return null;
      return (
        <RowDragPreview
          initials={getInitials(emp.name)}
          avatarClassName={getAvatarColor(emp.name)}
          name={emp.name}
          subtitle={
            emp.location ? `${emp.emp_id} • ${emp.location}` : emp.emp_id
          }
        />
      );
    },
    [employeeMap],
  );

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
      // Merge with existing URL params so other filters (e.g. ?query=)
      // aren't wiped. Also flush the current input value in case the
      // debounce hasn't yet committed — the key={date} remount would
      // otherwise re-initialize the search input from a stale URL.
      const params = new URLSearchParams(searchParams.toString());
      params.set("date", newDate);
      const trimmed = searchFilter.trim();
      if (trimmed) params.set("query", trimmed);
      else params.delete("query");
      startNavigation(() => {
        router.push(`/daily-logs?${params.toString()}`);
      });
    },
    [dirty, router, startNavigation, searchParams, searchFilter]
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
  // ISO YYYY-MM-DD strings are lexically orderable, so plain <=
  // is a safe "same day or earlier" check without Date objects.
  const isPastOrToday = date <= today;
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
            <DndTableProvider
              id="daily-logs-dnd"
              rowIds={rowIds}
              onDragEnd={handleDragEnd}
              renderOverlay={renderDragOverlay}
            >
            <table
              ref={tableRef}
              className="w-full border-collapse text-sm"
              style={
                {
                  tableLayout: "fixed",
                  // CSS vars drive col widths so the resize hook can update
                  // them via DOM ref during a drag without re-rendering React.
                  // React-controlled values here match the active drag value
                  // on commit, so there's no flicker on pointer-up.
                  "--col-employee-w": `${colWidths.employee}px`,
                  "--col-metrics-w": `${colWidths.metrics}px`,
                  minWidth: `calc(${DRAG_HANDLE_WIDTH}px + var(--col-employee-w) + var(--col-metrics-w) + ${REMARKS_MIN_WIDTH}px)`,
                } as React.CSSProperties
              }
            >
              <colgroup>
                <col style={{ width: DRAG_HANDLE_WIDTH }} />
                <col style={{ width: "var(--col-employee-w)" }} />
                <col style={{ width: "calc(var(--col-metrics-w) / 6)" }} />
                <col style={{ width: "calc(var(--col-metrics-w) / 6)" }} />
                <col style={{ width: "calc(var(--col-metrics-w) / 6)" }} />
                <col style={{ width: "calc(var(--col-metrics-w) / 6)" }} />
                <col style={{ width: "calc(var(--col-metrics-w) / 6)" }} />
                <col style={{ width: "calc(var(--col-metrics-w) / 6)" }} />
                <col />
              </colgroup>
              <thead ref={theadRef} className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800">
                {/* Group headers */}
                <tr>
                  {/* Corner cell: bumped to z-30 because thead is sticky-top
                      and DragHandleHeader is sticky-left — both axes intersect here.
                      The reset icon shows when there's a custom DnD order OR an active sort. */}
                  <DragHandleHeader
                    rowSpan={2}
                    className="z-30 border-r border-r-slate-200 dark:border-r-slate-700 border-b-2 border-b-slate-300 dark:border-b-slate-600"
                    onReset={handleResetOrder}
                    resetVisible={hasCustomOrder || isSorting}
                  />
                  <th
                    className="text-left p-3 text-sm font-semibold text-slate-700 dark:text-slate-300 tracking-wide sticky left-[40px] bg-slate-100 dark:bg-slate-800 z-30 border-r-2 border-r-slate-300 dark:border-r-slate-600 border-b-2 border-b-slate-300 dark:border-b-slate-600"
                    rowSpan={2}
                  >
                    <button
                      type="button"
                      onClick={() => handleSort("name")}
                      className="-ml-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
                    >
                      Employee
                      <ArrowUpDown
                        className={cn(
                          "h-3.5 w-3.5",
                          sortConfig?.field === "name"
                            ? "text-primary"
                            : "text-slate-400",
                        )}
                      />
                    </button>
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
                    <button
                      type="button"
                      onClick={() => handleSort("target_total_meetings")}
                      className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-slate-300/40 dark:hover:bg-slate-600/40"
                    >
                      Target
                      <ArrowUpDown
                        className={cn(
                          "h-3 w-3",
                          sortConfig?.field === "target_total_meetings"
                            ? "text-primary"
                            : "text-slate-400",
                        )}
                      />
                    </button>
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
                    <button
                      type="button"
                      onClick={() => handleSort("target_calls")}
                      className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-slate-300/40 dark:hover:bg-slate-600/40"
                    >
                      Target
                      <ArrowUpDown
                        className={cn(
                          "h-3 w-3",
                          sortConfig?.field === "target_calls"
                            ? "text-primary"
                            : "text-slate-400",
                        )}
                      />
                    </button>
                  </th>
                  <th className="text-center px-1.5 py-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-r-2 border-r-slate-300 dark:border-r-slate-600 border-b-2 border-b-slate-300 dark:border-b-slate-600">
                    Actual
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedEmployees.map((emp) => (
                  <EmployeeRow
                    key={emp.id}
                    employee={emp}
                    values={entries[emp.id] ?? EMPTY_ENTRY}
                    isDirty={dirty.has(emp.id)}
                    canEditTargets={canEditTargets}
                    canEdit={canEdit}
                    isPastOrToday={isPastOrToday}
                    isDragDisabled={isSorting}
                    onChange={handleChange}
                    onRemarkChange={handleRemarkChange}
                  />
                ))}
                {sortedEmployees.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-16">
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
            </DndTableProvider>
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

// memo() prevents re-rendering every row on every keystroke. Parent passes
// stable useCallback'd onChange/onRemarkChange and `values` is a stable
// reference unless THIS row's entries actually changed — so unaffected rows
// shallow-equal-skip on every edit. Massive win on large daily-logs lists.
const EmployeeRow = memo(function EmployeeRow({
  employee,
  values,
  isDirty,
  canEditTargets,
  canEdit,
  isPastOrToday,
  isDragDisabled,
  onChange,
  onRemarkChange,
}: {
  employee: Employee;
  values: EntryValues;
  isDirty: boolean;
  canEditTargets: boolean;
  canEdit: boolean;
  isPastOrToday: boolean;
  /** When sort is active, drag is suppressed so the visual order
   * doesn't snap back against the persisted custom order. */
  isDragDisabled: boolean;
  onChange: (empId: string, field: MetricFields, value: string) => void;
  onRemarkChange: (empId: string, value: string) => void;
}) {
  // Calls achievement
  const callsColors = getAchievementColors(
    values.target_calls,
    values.actual_calls,
    isPastOrToday
  );

  // Meetings achievement (combined: sum of 3 actuals vs single target)
  const meetingsTotal =
    values.actual_architect_meetings +
    values.actual_client_meetings +
    values.actual_site_visits;
  const meetingsColors = getAchievementColors(
    values.target_total_meetings,
    meetingsTotal,
    isPastOrToday
  );

  return (
    <SortableRow
      id={employee.id}
      disabled={isDragDisabled}
      className={`border-b border-border/40 transition-colors ${
        isDirty
          ? "bg-amber-50/70 dark:bg-amber-950/20"
          : "hover:bg-muted/20"
      }`}
    >
      {/* Drag handle — sticky-left + opaque bg-white from <DragHandleCell> defaults
          (must be opaque to prevent horizontal-scroll bleed-through; row-level
          dirty/hover bg won't show on sticky cells, but the "edited" badge in
          the Employee column makes dirty state obvious). */}
      <DragHandleCell cellClassName="border-r border-r-slate-200 dark:border-r-slate-700" />

      {/* Employee — sits flush against the 40px drag handle, also opaque. */}
      <td className="p-3 sticky left-[40px] bg-white dark:bg-slate-900 z-10 border-r-2 border-r-slate-300 dark:border-r-slate-600">
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
    </SortableRow>
  );
});
