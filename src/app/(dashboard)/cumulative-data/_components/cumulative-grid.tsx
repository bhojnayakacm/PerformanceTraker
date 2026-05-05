"use client";

import { memo, useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type Row,
  type SortingState,
} from "@tanstack/react-table";
import { Search, BarChart3, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useColumnSizing,
  type SizingColumn,
} from "@/components/data-table/use-column-sizing";
import { MonthRangeSelector } from "@/components/month-range-selector";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { cn } from "@/lib/utils";
import type { EmployeeCumulativeData } from "@/lib/types";
import { getColumns } from "./columns";

type Props = {
  data: EmployeeCumulativeData[];
  fromMonth: number;
  fromYear: number;
  toMonth: number;
  toYear: number;
  numberOfMonths: number;
};

export function CumulativeGrid({
  data,
  fromMonth,
  fromYear,
  toMonth,
  toYear,
  numberOfMonths,
}: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const { inputValue, setInputValue, isPending } = useDebouncedSearch(
    "query",
    300,
  );

  const columns = useMemo(() => getColumns(), []);

  const sizingColumns = useMemo<SizingColumn[]>(
    () =>
      columns
        .filter((c): c is typeof c & { id: string } => Boolean(c.id))
        .map((c) => ({
          id: c.id,
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

  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => row.employee.id,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    autoResetPageIndex: false,
    autoResetExpanded: false,
  });

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
        <div className="flex items-center gap-3">
          <span className="hidden md:inline text-xs font-medium text-slate-500">
            {numberOfMonths} {numberOfMonths === 1 ? "month" : "months"}
            <span className="mx-1.5 text-slate-300">·</span>
            {data.length} {data.length === 1 ? "employee" : "employees"}
          </span>
          <MonthRangeSelector
            fromMonth={fromMonth}
            fromYear={fromYear}
            toMonth={toMonth}
            toYear={toYear}
            basePath="/cumulative-data"
            getExtraParams={() => ({ query: inputValue.trim() })}
          />
        </div>
      </div>

      {/* Table — same scroll-lock physics as MonthlyData: outer flex column
          owns min-h-0 so the table body scrolls instead of the page. */}
      <Card
        className={cn(
          "flex-1 min-h-0 flex flex-col border-0 py-0 gap-0 rounded-2xl bg-white ring-1 ring-slate-200 shadow-[0_4px_24px_-12px_rgba(79,70,229,0.12)] overflow-hidden transition-all duration-200 hover:shadow-[0_6px_28px_-10px_rgba(79,70,229,0.18)]",
          isPending && "opacity-60 pointer-events-none",
        )}
      >
        <CardContent className="flex-1 min-h-0 flex flex-col p-0">
          <div className="flex-1 min-h-0 overflow-auto">
            <table
              ref={tableRef}
              className="border-collapse caption-bottom text-sm"
              style={{
                ...tableStyle,
                width: widthCalc,
                minWidth: "100%",
              }}
            >
              <colgroup>
                {sizingColumns.map((c) => (
                  <col key={c.id} style={getColumnStyle(c.id)} />
                ))}
              </colgroup>
              <TableHeader className="sticky top-0 z-20">
                {table.getHeaderGroups().map((hg) => (
                  <TableRow
                    key={hg.id}
                    className="hover:bg-transparent border-b-0"
                  >
                    {hg.headers.map((h) => {
                      const isStickyName = h.column.id === "employee";
                      const isResizing = resizingId === h.column.id;
                      return (
                        <TableHead
                          key={h.id}
                          className={cn(
                            "relative bg-slate-100 text-slate-700 font-semibold border-b-2 border-slate-200 border-r border-r-slate-200/60 last:border-r-0",
                            isStickyName && "sticky left-0 z-30",
                          )}
                        >
                          {h.isPlaceholder
                            ? null
                            : flexRender(
                                h.column.columnDef.header,
                                h.getContext(),
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
                  table
                    .getRowModel()
                    .rows.map((row) => <CumulativeRow key={row.id} row={row} />)
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-48 text-center"
                    >
                      <div className="flex flex-col items-center gap-3 py-4">
                        <div className="flex size-12 items-center justify-center rounded-full bg-muted/60">
                          <BarChart3 className="h-6 w-6 text-muted-foreground/80" />
                        </div>
                        <div className="space-y-1 text-center">
                          <p className="text-sm font-medium text-foreground/70">
                            No data for this range
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {inputValue
                              ? "Try adjusting your search."
                              : "Try a different month range."}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Memoized row ────────────────────────────────────────────────────────── */

type RowProps = { row: Row<EmployeeCumulativeData> };

const CumulativeRow = memo(
  function CumulativeRow({ row }: RowProps) {
    return (
      <TableRow className="border-b border-border/50 transition-colors hover:bg-muted/30">
        {row.getVisibleCells().map((cell) => {
          const isStickyName = cell.column.id === "employee";
          return (
            <TableCell
              key={cell.id}
              className={cn(
                "border-r border-slate-200/60 last:border-r-0 align-top",
                isStickyName && "sticky left-0 z-10 bg-white",
              )}
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </TableCell>
          );
        })}
      </TableRow>
    );
  },
  (prev, next) =>
    prev.row.original === next.row.original && prev.row.id === next.row.id,
);
