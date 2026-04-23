"use client";

import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
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
import { cn } from "@/lib/utils";
import type { EmployeeMonthlyData, UserRole, City } from "@/lib/types";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { getColumns } from "./columns";
import { EmployeeDetailDialog } from "./employee-detail-dialog";
import { ManageCitiesDialog } from "./manage-cities-dialog";
import { MonthSelector } from "@/components/month-selector";

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

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
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
            <table className="w-full border-collapse caption-bottom text-sm">
              <TableHeader className="sticky top-0 z-20">
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id} className="hover:bg-transparent border-b-0">
                    {hg.headers.map((h) => (
                      <TableHead
                        key={h.id}
                        className="bg-slate-100 text-slate-700 font-semibold border-b-2 border-slate-200 border-r border-r-slate-200/60 dark:border-r-slate-700/60 last:border-r-0"
                      >
                        {h.isPlaceholder
                          ? null
                          : flexRender(
                              h.column.columnDef.header,
                              h.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => {
                        setSelectedRow(row.original);
                        setDetailOpen(true);
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="border-r border-slate-200/60 dark:border-slate-700/60 last:border-r-0">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
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
