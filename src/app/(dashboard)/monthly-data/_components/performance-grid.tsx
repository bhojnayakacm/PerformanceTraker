"use client";

import { memo, useCallback, useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type Row,
  type SortingState,
} from "@tanstack/react-table";
import { Search, CalendarDays, Building2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DRAG_HANDLE_COL_ID,
  DndTableProvider,
  DragHandleCell,
  DragHandleHeader,
  RowDragPreview,
  SortableRow,
  useTableDnD,
} from "@/components/data-table/sortable-table";
import {
  useColumnSizing,
  type SizingColumn,
} from "@/components/data-table/use-column-sizing";
import { cn, getAvatarColor, getInitials } from "@/lib/utils";
import type { EmployeeMonthlyData, UserRole, City } from "@/lib/types";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { getColumns } from "./columns";
import { EmployeeDetailDialog } from "./employee-detail-dialog";
import { ManageCitiesDialog } from "./manage-cities-dialog";
import { MonthSelector } from "@/components/month-selector";

const MONTHLY_DATA_ORDER_KEY = "monthly_data_custom_order";
const DRAG_HANDLE_WIDTH = 40;

type Props = {
  data: EmployeeMonthlyData[];
  userRole: UserRole;
  month: number;
  year: number;
  isCurrentMonth?: boolean;
  cities: City[];
};

export function PerformanceGrid({
  data,
  userRole,
  month,
  year,
  isCurrentMonth,
  cities,
}: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const { inputValue, setInputValue, isPending } = useDebouncedSearch("query", 300);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<EmployeeMonthlyData | null>(
    null
  );
  const [manageCitiesOpen, setManageCitiesOpen] = useState(false);

  const columns = useMemo(() => getColumns(isCurrentMonth), [isCurrentMonth]);

  // Pull the resizable columns (everything except the drag handle) out of
  // the TanStack column defs and feed them to our CSS-var-based sizing hook.
  // TanStack's own column resizing is intentionally disabled below — its
  // per-pointermove `setColumnSizingInfo` calls were a key freeze source.
  const sizingColumns = useMemo<SizingColumn[]>(
    () =>
      columns
        .filter((c) => c.id && c.id !== DRAG_HANDLE_COL_ID)
        .map((c) => ({
          id: c.id as string,
          size: c.size ?? 150,
          minSize: c.minSize ?? 80,
        })),
    [columns],
  );

  const {
    tableRef,
    tableStyle,
    widthCalc,
    getColumnStyle,
    getResizeHandleProps,
    resizingId,
  } = useColumnSizing(sizingColumns);

  // Stable id-extractor — useTableDnD now absorbs this into a ref internally,
  // but we also want the same function reference to feed TanStack's getRowId
  // (and any future consumers) so nothing destabilizes downstream.
  const getRowId = useCallback(
    (row: EmployeeMonthlyData) => row.employee.id,
    [],
  );

  const { orderedData, rowIds, handleDragEnd, resetOrder, hasCustomOrder } =
    useTableDnD<EmployeeMonthlyData>({
      data,
      storageKey: MONTHLY_DATA_ORDER_KEY,
      getId: getRowId,
    });

  const table = useReactTable({
    data: orderedData,
    columns,
    getRowId,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    // Resize is handled by `useColumnSizing` (CSS-var-driven, no React work
    // per pointermove). TanStack's own resize is left off because even
    // `onEnd` mode pumps `setColumnSizingInfo` per move event.
    // Defensive — we don't use pagination/expansion, but if a future change
    // adds them, an autoReset cycle on data mutation (e.g. drop reorder)
    // could lock the main thread chasing dependent state. Off by default.
    autoResetPageIndex: false,
    autoResetExpanded: false,
  });

  const isSorting = sorting.length > 0;

  const handleResetOrder = useCallback(() => {
    setSorting([]);
    resetOrder();
  }, [resetOrder]);

  // PERF: stable callback so MonthlyDataRow's memo holds. Without useCallback
  // here, every PerformanceGrid render hands every row a fresh function,
  // and the row-level memo bails out instantly.
  const handleSelectRow = useCallback((data: EmployeeMonthlyData) => {
    setSelectedRow(data);
    setDetailOpen(true);
  }, []);

  // Pre-built lookup so renderOverlay below is O(1) per drag start instead
  // of an O(n) `find()` over orderedData every time it re-fires.
  const rowMap = useMemo(() => {
    const map = new Map<string, EmployeeMonthlyData>();
    for (const row of orderedData) map.set(row.employee.id, row);
    return map;
  }, [orderedData]);

  const renderDragOverlay = useCallback(
    (activeId: string) => {
      const row = rowMap.get(activeId);
      if (!row) return null;
      const { name, emp_id, location } = row.employee;
      return (
        <RowDragPreview
          initials={getInitials(name)}
          avatarClassName={getAvatarColor(name)}
          name={name}
          subtitle={location ? `${emp_id} • ${location}` : emp_id}
        />
      );
    },
    [rowMap],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center justify-between gap-3 flex-wrap rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_0_rgba(15,23,42,0.04)] transition-all duration-200 hover:shadow-[0_4px_16px_-6px_rgba(79,70,229,0.15)]">
        <div className="relative flex-1 max-w-sm min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search employees..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="pl-9"
          />
          {isPending && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {userRole === "super_admin" && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => setManageCitiesOpen(true)}
            >
              <Building2 className="h-4 w-4" />
              Manage Cities
            </Button>
          )}
          <MonthSelector
            month={month}
            year={year}
            basePath="/monthly-data"
            getExtraParams={() => ({ query: inputValue.trim() })}
          />
        </div>
      </div>

      {/* Table */}
      <Card className={cn("flex-1 min-h-0 flex flex-col border-0 py-0 gap-0 rounded-2xl bg-white ring-1 ring-slate-200 shadow-[0_4px_24px_-12px_rgba(79,70,229,0.12)] overflow-hidden transition-all duration-200 hover:shadow-[0_6px_28px_-10px_rgba(79,70,229,0.18)]", isPending && "opacity-60 pointer-events-none")}>
        <CardContent className="flex-1 min-h-0 flex flex-col p-0">
          <div className="flex-1 min-h-0 overflow-auto">
            <DndTableProvider
              id="monthly-data-dnd"
              rowIds={rowIds}
              onDragEnd={handleDragEnd}
              renderOverlay={renderDragOverlay}
            >
              {/* `tableLayout: fixed` + explicit <col> widths is the canonical
                  pattern. <col> widths are CSS-var-driven so the resize
                  hook can mutate them via DOM ref during a drag without
                  triggering any React re-renders. */}
              <table
                ref={tableRef}
                className="border-collapse caption-bottom text-sm"
                style={{
                  ...tableStyle,
                  width: `calc(${DRAG_HANDLE_WIDTH}px + ${widthCalc})`,
                  minWidth: "100%",
                }}
              >
                <colgroup>
                  <col style={{ width: DRAG_HANDLE_WIDTH }} />
                  {sizingColumns.map((c) => (
                    <col key={c.id} style={getColumnStyle(c.id)} />
                  ))}
                </colgroup>
                <TableHeader className="sticky top-0 z-20">
                  {table.getHeaderGroups().map((hg) => (
                    <TableRow key={hg.id} className="hover:bg-transparent border-b-0">
                      {hg.headers.map((h) => {
                        if (h.column.id === DRAG_HANDLE_COL_ID) {
                          return (
                            <DragHandleHeader
                              key={h.id}
                              className="z-30"
                              onReset={handleResetOrder}
                              resetVisible={hasCustomOrder || isSorting}
                            />
                          );
                        }
                        const isStickyName = h.column.id === "employee";
                        const isResizing = resizingId === h.column.id;
                        return (
                          <TableHead
                            key={h.id}
                            className={cn(
                              "relative bg-slate-100 text-slate-700 font-semibold border-b-2 border-slate-200 border-r border-r-slate-200/60 dark:border-r-slate-700/60 last:border-r-0",
                              isStickyName && "sticky left-[40px] z-30",
                            )}
                          >
                            {h.isPlaceholder
                              ? null
                              : flexRender(
                                  h.column.columnDef.header,
                                  h.getContext()
                                )}
                            <div
                              {...getResizeHandleProps(h.column.id)}
                              role="separator"
                              aria-orientation="vertical"
                              aria-label={`Resize ${h.column.id} column`}
                              className={cn(
                                "absolute top-0 right-0 z-40 h-full w-1.5 translate-x-1/2 cursor-col-resize touch-none select-none transition-colors",
                                isResizing
                                  ? "bg-indigo-600"
                                  : "bg-transparent hover:bg-indigo-500/70",
                              )}
                            />
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.length ? (
                    table.getRowModel().rows.map((row) => (
                      <MonthlyDataRow
                        key={row.id}
                        row={row}
                        disabled={isSorting}
                        onSelect={handleSelectRow}
                      />
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        className="h-48 text-center"
                      >
                        <div className="flex flex-col items-center gap-3 py-4">
                          <div className="flex size-12 items-center justify-center rounded-full bg-muted/60">
                            <CalendarDays className="h-6 w-6 text-muted-foreground/80" />
                          </div>
                          <div className="space-y-1 text-center">
                            <p className="text-sm font-medium text-foreground/70">
                              No data for this month
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {inputValue
                                ? "Try adjusting your search."
                                : "Click on an employee row to enter their monthly data."}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </table>
            </DndTableProvider>
          </div>
        </CardContent>
      </Card>

      {/* Detail Dialog — expansive bento-grid takeover */}
      <EmployeeDetailDialog
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setSelectedRow(null);
        }}
        data={selectedRow}
        month={month}
        year={year}
        userRole={userRole}
        cities={cities}
      />

      {/* Manage Cities Dialog (super_admin only) */}
      {userRole === "super_admin" && (
        <ManageCitiesDialog
          open={manageCitiesOpen}
          onOpenChange={setManageCitiesOpen}
          cities={cities}
        />
      )}
    </div>
  );
}

/* ── Memoized row ────────────────────────────────────────────────────────── */

type MonthlyDataRowProps = {
  row: Row<EmployeeMonthlyData>;
  disabled: boolean;
  onSelect: (data: EmployeeMonthlyData) => void;
};

/**
 * PERF: Wrapping the body cells in their own memoized component is what
 * actually makes <SortableRow>'s memo effective — it gives us a referentially
 * stable `children` ReactElement to pass down. The custom comparator skips
 * over TanStack's fresh `row` object identity (which changes every render)
 * and compares `row.original` instead — that's stable unless this row's data
 * actually changed. Combined with the useCallback'd `onSelect`, unaffected
 * rows now skip rendering entirely during drag/sort/resize.
 */
const MonthlyDataRow = memo(
  function MonthlyDataRow({ row, disabled, onSelect }: MonthlyDataRowProps) {
    const handleClick = useCallback(
      () => onSelect(row.original),
      [row.original, onSelect],
    );

    return (
      <SortableRow
        id={row.id}
        disabled={disabled}
        className="cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/30"
        onClick={handleClick}
      >
        {row.getVisibleCells().map((cell) => {
          if (cell.column.id === DRAG_HANDLE_COL_ID) {
            return <DragHandleCell key={cell.id} />;
          }
          const isStickyName = cell.column.id === "employee";
          return (
            <TableCell
              key={cell.id}
              className={cn(
                "border-r border-slate-200/60 dark:border-slate-700/60 last:border-r-0",
                isStickyName &&
                  "sticky left-[40px] z-10 bg-white dark:bg-slate-900",
              )}
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </TableCell>
          );
        })}
      </SortableRow>
    );
  },
  (prev, next) =>
    prev.row.original === next.row.original &&
    prev.row.id === next.row.id &&
    prev.disabled === next.disabled &&
    prev.onSelect === next.onSelect,
);
