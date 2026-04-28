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
import { Search, ShieldPlus, UserCog } from "lucide-react";
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
import type { Employee, Profile } from "@/lib/types";
import { toggleUserStatus } from "../actions";
import { getColumns } from "./columns";
import { ManagerAssignmentDialog } from "./manager-assignment-dialog";

const USERS_ORDER_KEY = "users_custom_order";

type Props = {
  data: Profile[];
  currentUserId: string;
  employees: Employee[];
};

export function UsersDataTable({ data, currentUserId, employees }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [, startTransition] = useTransition();
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [assignmentTarget, setAssignmentTarget] = useState<Profile | null>(null);

  const columns = useMemo(
    () =>
      getColumns(currentUserId, {
        onToggleStatus: (userId, currentStatus) => {
          startTransition(async () => {
            const result = await toggleUserStatus(userId, currentStatus);
            if ("error" in result) {
              toast.error(result.error);
            } else {
              toast.success(
                `User ${currentStatus ? "deactivated" : "activated"}`
              );
            }
          });
        },
        onManageAssignments: (profile) => {
          setAssignmentTarget(profile);
          setAssignmentDialogOpen(true);
        },
      }),
    [currentUserId, startTransition]
  );

  const getRowId = useCallback((row: Profile) => row.id, []);

  const { orderedData, rowIds, handleDragEnd, resetOrder, hasCustomOrder } =
    useTableDnD<Profile>({
      data,
      storageKey: USERS_ORDER_KEY,
      getId: getRowId,
    });

  const table = useReactTable({
    data: orderedData,
    columns,
    getRowId,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue: string) => {
      const search = filterValue.toLowerCase();
      const name = (row.original.full_name ?? "").toLowerCase();
      const role = (row.original.role ?? "").toLowerCase();
      return name.includes(search) || role.includes(search);
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    autoResetPageIndex: false,
    autoResetExpanded: false,
  });

  const isSorting = sorting.length > 0;

  const handleResetOrder = useCallback(() => {
    setSorting([]);
    resetOrder();
  }, [resetOrder]);

  // O(1) lookup map for the drag overlay.
  const rowMap = useMemo(() => {
    const map = new Map<string, Profile>();
    for (const row of orderedData) map.set(row.id, row);
    return map;
  }, [orderedData]);

  const renderDragOverlay = useCallback(
    (activeId: string) => {
      const user = rowMap.get(activeId);
      if (!user) return null;
      const name = user.full_name || "Unnamed User";
      return (
        <RowDragPreview
          initials={getInitials(name)}
          avatarClassName={getAvatarColor(name)}
          name={name}
          subtitle={user.role}
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
            placeholder="Search by name or role..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          onClick={() =>
            toast.info("User invitations coming soon.", {
              description:
                "For now, users can sign up and will be assigned the Viewer role automatically.",
            })
          }
        >
          <ShieldPlus className="mr-2 h-4 w-4" />
          Invite User
        </Button>
      </div>

      {/* Table */}
      <Card className="flex-1 min-h-0 flex flex-col border-0 py-0 gap-0 rounded-2xl bg-white ring-1 ring-slate-200 shadow-[0_4px_24px_-12px_rgba(79,70,229,0.12)] overflow-hidden transition-all duration-200 hover:shadow-[0_6px_28px_-10px_rgba(79,70,229,0.18)]">
        <CardContent className="flex-1 min-h-0 flex flex-col p-0">
          <div className="flex-1 min-h-0 overflow-auto">
            <DndTableProvider
              id="users-dnd"
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
                          return (
                            <DragHandleHeader
                              key={header.id}
                              className="z-30"
                              onReset={handleResetOrder}
                              resetVisible={hasCustomOrder || isSorting}
                            />
                          );
                        }
                        const isStickyName = header.column.id === "full_name";
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
                      <UsersTableRow
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
                            <UserCog className="h-6 w-6 text-muted-foreground/80" />
                          </div>
                          <div className="space-y-1 text-center">
                            <p className="text-sm font-medium text-foreground/70">No users found</p>
                            <p className="text-xs text-muted-foreground">
                              {globalFilter
                                ? "Try adjusting your search."
                                : "Users will appear here after they sign up."}
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

      {/* Manager Assignment Dialog */}
      <ManagerAssignmentDialog
        open={assignmentDialogOpen}
        onOpenChange={(open) => {
          setAssignmentDialogOpen(open);
          if (!open) setAssignmentTarget(null);
        }}
        manager={assignmentTarget}
        employees={employees}
      />
    </div>
  );
}

/* ── Memoized row ────────────────────────────────────────────────────────── */

type UsersTableRowProps = {
  row: Row<Profile>;
  disabled: boolean;
};

/**
 * PERF: Stable children for <SortableRow> via memo with a row.original-based
 * comparator. See `EmployeesTableRow` / `MonthlyDataRow` for the rationale.
 */
const UsersTableRow = memo(
  function UsersTableRow({ row, disabled }: UsersTableRowProps) {
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
          const isStickyName = cell.column.id === "full_name";
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
