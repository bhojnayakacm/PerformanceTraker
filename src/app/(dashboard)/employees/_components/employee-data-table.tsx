"use client";

import { memo, useCallback, useMemo, useState, useTransition } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  type Row,
  type SortingState,
} from "@tanstack/react-table";
import { Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  DRAG_HANDLE_COL_ID,
  DndTableProvider,
  DragHandleCell,
  DragHandleHeader,
  RowDragPreview,
  SortableRow,
  useTableDnD,
} from "@/components/data-table/sortable-table";
import { cn, getAvatarColor, getInitials } from "@/lib/utils";
import type { Employee, UserRole } from "@/lib/types";
import { toggleEmployeeStatus } from "../actions";
import { getColumns } from "./columns";
import { EmployeeFormDialog } from "./employee-form-dialog";

const EMPLOYEES_ORDER_KEY = "employees_custom_order";

type Props = {
  data: Employee[];
  userRole: UserRole;
};

export function EmployeeDataTable({ data, userRole }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [, startTransition] = useTransition();

  const columns = useMemo(
    () =>
      getColumns(userRole, {
        onEdit: (emp) => {
          setEditingEmployee(emp);
          setDialogOpen(true);
        },
        onToggleStatus: (emp) => {
          startTransition(async () => {
            const result = await toggleEmployeeStatus(emp.id, emp.is_active);
            if ("error" in result) {
              toast.error(result.error);
            } else {
              toast.success(
                `${emp.name} ${emp.is_active ? "deactivated" : "activated"}`
              );
            }
          });
        },
      }),
    [userRole, startTransition]
  );

  // Stable id-extractor — feeds both useTableDnD and TanStack's getRowId.
  const getRowId = useCallback((row: Employee) => row.id, []);

  const { orderedData, rowIds, handleDragEnd, resetOrder, hasCustomOrder } =
    useTableDnD<Employee>({
      data,
      storageKey: EMPLOYEES_ORDER_KEY,
      getId: getRowId,
    });

  const table = useReactTable({
    data: orderedData,
    columns,
    // Use the DB primary key as the row id so dnd-kit's drop targets line up
    // with our persisted custom-order ids (instead of the default row index).
    getRowId,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue: string) => {
      const search = filterValue.toLowerCase();
      const name = (row.original.name ?? "").toLowerCase();
      const empId = (row.original.emp_id ?? "").toLowerCase();
      const location = (row.original.location ?? "").toLowerCase();
      const state = (row.original.state ?? "").toLowerCase();
      return name.includes(search) || empId.includes(search) || location.includes(search) || state.includes(search);
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    autoResetPageIndex: false,
    autoResetExpanded: false,
  });

  // When TanStack column sort is active, the visible order is driven by the
  // sort comparator — disable dragging in that mode so the user doesn't see
  // a drag that visually "snaps back" once the sorted view re-renders.
  const isSorting = sorting.length > 0;

  const handleResetOrder = useCallback(() => {
    setSorting([]);
    resetOrder();
  }, [resetOrder]);

  // Pre-built lookup so the drag overlay's row resolution is O(1).
  const rowMap = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const row of orderedData) map.set(row.id, row);
    return map;
  }, [orderedData]);

  const renderDragOverlay = useCallback(
    (activeId: string) => {
      const emp = rowMap.get(activeId);
      if (!emp) return null;
      return (
        <RowDragPreview
          initials={getInitials(emp.name)}
          avatarClassName={getAvatarColor(emp.name)}
          name={emp.name}
          subtitle={emp.emp_id}
        />
      );
    },
    [rowMap],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_0_rgba(15,23,42,0.04)] transition-all duration-200 hover:shadow-[0_4px_16px_-6px_rgba(79,70,229,0.15)]">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, ID, or location..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        {userRole === "super_admin" && (
          <Button
            onClick={() => {
              setEditingEmployee(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Employee
          </Button>
        )}
      </div>

      {/* Table */}
      <Card className="flex-1 min-h-0 flex flex-col border-0 py-0 gap-0 rounded-2xl bg-white ring-1 ring-slate-200 shadow-[0_4px_24px_-12px_rgba(79,70,229,0.12)] overflow-hidden transition-all duration-200 hover:shadow-[0_6px_28px_-10px_rgba(79,70,229,0.18)]">
        <CardContent className="flex-1 min-h-0 flex flex-col p-0">
          <div className="flex-1 min-h-0 overflow-auto">
            {/* DndContext lives OUTSIDE <table> — it injects an aria-announce
                <div> sibling that would otherwise be invalid HTML inside <table>. */}
            <DndTableProvider
              id="employees-dnd"
              rowIds={rowIds}
              onDragEnd={handleDragEnd}
              renderOverlay={renderDragOverlay}
            >
              <table className="w-full border-collapse caption-bottom text-sm">
                <TableHeader className="sticky top-0 z-20">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id} className="hover:bg-transparent border-b-0">
                      {headerGroup.headers.map((header) => {
                        if (header.column.id === DRAG_HANDLE_COL_ID) {
                          // Corner cell: sticky-top (via TableHeader) + sticky-left
                          // → bump to z-30 so it stays above both axes.
                          return (
                            <DragHandleHeader
                              key={header.id}
                              className="z-30"
                              onReset={handleResetOrder}
                              resetVisible={hasCustomOrder || isSorting}
                            />
                          );
                        }
                        // Pin the Name column flush against the drag handle so
                        // the row identifier never scrolls off-screen.
                        const isStickyName = header.column.id === "name";
                        return (
                          <TableHead
                            key={header.id}
                            className={cn(
                              "bg-slate-100 text-slate-700 font-semibold border-b-2 border-slate-200",
                              isStickyName && "sticky left-[40px] z-30",
                            )}
                          >
                            {header.isPlaceholder
                              ? null
                              : flexRender(
                                  header.column.columnDef.header,
                                  header.getContext()
                                )}
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.length ? (
                    table.getRowModel().rows.map((row) => (
                      <EmployeesTableRow
                        key={row.id}
                        row={row}
                        disabled={isSorting}
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
                            <Users className="h-6 w-6 text-muted-foreground/80" />
                          </div>
                          <div className="space-y-1 text-center">
                            <p className="text-sm font-medium text-foreground/70">No employees found</p>
                            <p className="text-xs text-muted-foreground">
                              {globalFilter
                                ? "Try adjusting your search."
                                : "Get started by adding your first employee."}
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

      {/* Shared dialog for Add / Edit */}
      <EmployeeFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingEmployee(null);
        }}
        employee={editingEmployee}
      />
    </div>
  );
}

/* ── Memoized row ────────────────────────────────────────────────────────── */

type EmployeesTableRowProps = {
  row: Row<Employee>;
  disabled: boolean;
};

/**
 * PERF: A memoized row body lets <SortableRow> see a stable `children`
 * reference, so its own memo can actually skip work. Custom comparator
 * checks `row.original` rather than the TanStack `row` (which is a fresh
 * object each render); column actions live on column defs and aren't
 * passed as props, so they don't need separate stability handling here.
 */
const EmployeesTableRow = memo(
  function EmployeesTableRow({ row, disabled }: EmployeesTableRowProps) {
    return (
      <SortableRow
        id={row.id}
        disabled={disabled}
        className="border-b border-border/50 transition-colors duration-150 hover:bg-muted/40"
      >
        {row.getVisibleCells().map((cell) => {
          if (cell.column.id === DRAG_HANDLE_COL_ID) {
            return <DragHandleCell key={cell.id} />;
          }
          const isStickyName = cell.column.id === "name";
          return (
            <TableCell
              key={cell.id}
              className={cn(
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
    prev.disabled === next.disabled,
);
