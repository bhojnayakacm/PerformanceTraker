"use client";

import { useState, useTransition } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
} from "@tanstack/react-table";
import {
  FileSpreadsheet,
  FileDown,
  Loader2,
  Search,
  FileBarChart,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { generateReport } from "../actions";
import { exportToExcel, exportToCSV } from "../_lib/export-helpers";
import { columns } from "./columns";
import type { ReportRow, ReportFilters } from "../_lib/report-types";
import type { Employee } from "@/lib/types";

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

type Props = {
  employees: Employee[];
};

export function ReportBuilder({ employees }: Props) {
  const now = new Date();
  const [fromMonth, setFromMonth] = useState(now.getMonth() + 1);
  const [fromYear, setFromYear] = useState(now.getFullYear());
  const [toMonth, setToMonth] = useState(now.getMonth() + 1);
  const [toYear, setToYear] = useState(now.getFullYear());
  const [employeeId, setEmployeeId] = useState("all");

  const [data, setData] = useState<ReportRow[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isExporting, setIsExporting] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data: data ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const selectClass =
    "h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

  const handleGenerate = () => {
    const filters: ReportFilters = {
      fromMonth,
      fromYear,
      toMonth,
      toYear,
      employeeId,
    };

    startTransition(async () => {
      const result = await generateReport(filters);
      if (result.success) {
        setData(result.data);
        if (result.data.length === 0) {
          toast.info("No data found for the selected filters.");
        }
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleExport = (format: "excel" | "csv") => {
    if (!data || data.length === 0) return;
    setIsExporting(true);

    const fromLabel = `${MONTHS[fromMonth - 1].slice(0, 3)}${fromYear}`;
    const toLabel = `${MONTHS[toMonth - 1].slice(0, 3)}${toYear}`;
    const filename =
      fromLabel === toLabel
        ? `Report_${fromLabel}`
        : `Report_${fromLabel}-${toLabel}`;

    // Use setTimeout to let the UI update with the loading state
    setTimeout(() => {
      try {
        if (format === "excel") {
          exportToExcel(data, `${filename}.xlsx`);
        } else {
          exportToCSV(data, `${filename}.csv`);
        }
        toast.success(
          `Exported ${data.length} rows as ${format === "excel" ? "Excel" : "CSV"}.`
        );
      } catch {
        toast.error("Export failed. Please try again.");
      } finally {
        setIsExporting(false);
      }
    }, 100);
  };

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            {/* Filter Controls */}
            <div className="flex flex-wrap items-end gap-4">
              {/* From */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  From
                </label>
                <div className="flex gap-1.5">
                  <select
                    value={fromMonth}
                    onChange={(e) => setFromMonth(parseInt(e.target.value))}
                    className={selectClass}
                  >
                    {MONTHS.map((name, i) => (
                      <option key={i + 1} value={i + 1}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={fromYear}
                    onChange={(e) => setFromYear(parseInt(e.target.value))}
                    className={selectClass}
                  >
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* To */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  To
                </label>
                <div className="flex gap-1.5">
                  <select
                    value={toMonth}
                    onChange={(e) => setToMonth(parseInt(e.target.value))}
                    className={selectClass}
                  >
                    {MONTHS.map((name, i) => (
                      <option key={i + 1} value={i + 1}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={toYear}
                    onChange={(e) => setToYear(parseInt(e.target.value))}
                    className={selectClass}
                  >
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Employee */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Employee
                </label>
                <select
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className={`${selectClass} max-w-[220px]`}
                >
                  <option value="all">All Employees</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.emp_id})
                    </option>
                  ))}
                </select>
              </div>

              {/* Generate */}
              <Button onClick={handleGenerate} disabled={isPending}>
                {isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                Generate Report
              </Button>
            </div>

            {/* Export buttons — only show when data is loaded */}
            {data && data.length > 0 && (
              <div className="flex items-center gap-2 border-t pt-3">
                <span className="text-sm text-muted-foreground mr-1">
                  {data.length} row{data.length !== 1 ? "s" : ""} found
                </span>
                <div className="ml-auto flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExport("csv")}
                    disabled={isExporting}
                  >
                    {isExporting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <FileDown className="mr-2 h-4 w-4" />
                    )}
                    Export CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExport("excel")}
                    disabled={isExporting}
                  >
                    {isExporting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                    )}
                    Export Excel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Report Table or Empty State */}
      {data === null ? (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
              <FileBarChart className="h-12 w-12" />
              <div>
                <p className="text-lg font-medium">
                  Select filters to generate a report
                </p>
                <p className="text-sm mt-1">
                  Choose a date range and employee, then click &quot;Generate
                  Report&quot;.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : data.length === 0 ? (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
              <Search className="h-12 w-12" />
              <div>
                <p className="text-lg font-medium">No data found</p>
                <p className="text-sm mt-1">
                  Try adjusting your date range or selecting a different
                  employee.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => (
                    <TableHead key={h.id} className="whitespace-nowrap">
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
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="whitespace-nowrap">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
