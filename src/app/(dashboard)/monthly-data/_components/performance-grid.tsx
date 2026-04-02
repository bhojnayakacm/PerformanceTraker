"use client";

import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
} from "@tanstack/react-table";
import { Search, CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EmployeeMonthlyData, UserRole } from "@/lib/types";
import { getColumns } from "./columns";
import { EmployeeDetailSheet } from "./employee-detail-sheet";
import { MonthSelector } from "@/components/month-selector";

type Props = {
  data: EmployeeMonthlyData[];
  userRole: UserRole;
  month: number;
  year: number;
  isCurrentMonth?: boolean;
};

export function PerformanceGrid({ data, userRole, month, year, isCurrentMonth }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<EmployeeMonthlyData | null>(
    null
  );

  const columns = useMemo(() => getColumns(isCurrentMonth), [isCurrentMonth]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue: string) => {
      const search = filterValue.toLowerCase();
      return (
        row.original.employee.name.toLowerCase().includes(search) ||
        row.original.employee.emp_id.toLowerCase().includes(search)
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-border/60 bg-card p-3 transition-shadow duration-300 hover:shadow-md">
        <div className="relative flex-1 max-w-sm min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search employees..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <MonthSelector month={month} year={year} basePath="/monthly-data" />
      </div>

      {/* Table */}
      <Card className="border-0 py-0 gap-0 shadow-sm ring-1 ring-border/50 overflow-hidden transition-shadow duration-300 hover:shadow-md">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className="border-r border-slate-200/60 dark:border-slate-700/60 last:border-r-0">
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
                    setSheetOpen(true);
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
                        {globalFilter
                          ? "Try adjusting your search."
                          : "Click on an employee row to enter their monthly data."}
                      </p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <EmployeeDetailSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setSelectedRow(null);
        }}
        data={selectedRow}
        month={month}
        year={year}
        userRole={userRole}
      />
    </div>
  );
}
