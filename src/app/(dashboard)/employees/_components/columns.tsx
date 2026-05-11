"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, MoreHorizontal, Pencil, ToggleRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DRAG_HANDLE_COL_ID } from "@/components/data-table/sortable-table";
import type { Employee, UserRole } from "@/lib/types";
import { getInitials, getAvatarColor, formatDoj } from "@/lib/utils";

type ColumnActions = {
  onEdit: (employee: Employee) => void;
  onToggleStatus: (employee: Employee) => void;
};

export function getColumns(
  userRole: UserRole,
  actions: ColumnActions,
  /* Resolution map for the Reporting Manager column. Passed in (rather than
   * derived inside the column) so the parent table can `useMemo` it on the
   * data array reference — building it inside the cell renderer would rebuild
   * it on every row, every render. O(n) build → O(1) lookup is the whole
   * point of doing this client-side instead of a Supabase join. */
  managerMap: Map<string, Employee>,
): ColumnDef<Employee>[] {
  const columns: ColumnDef<Employee>[] = [
    {
      // Empty placeholder column — actual GripVertical button is rendered
      // by <DragHandleCell> in the row mapper, which receives drag listeners
      // from the parent <SortableRow>'s useSortable hook.
      id: DRAG_HANDLE_COL_ID,
      header: () => null,
      cell: () => null,
      enableSorting: false,
      enableGlobalFilter: false,
      size: 40,
    },
    {
      accessorKey: "name",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-3"
        >
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const name = row.getValue("name") as string;
        return (
          <div className="flex items-center gap-3">
            <div
              className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${getAvatarColor(name)}`}
            >
              {getInitials(name)}
            </div>
            <span className="font-medium">{name}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "emp_id",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-3"
        >
          Emp ID
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <code className="text-sm text-muted-foreground">
          {row.getValue("emp_id")}
        </code>
      ),
    },
    {
      accessorKey: "location",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-3"
        >
          Location
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => row.getValue("location") || "—",
    },
    {
      accessorKey: "state",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-3"
        >
          State
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => row.getValue("state") || "—",
    },
    {
      id: "reporting_manager",
      // Sort by the resolved manager NAME (not by FK UUID — that would put
      // employees in a random visual order). Tier-1 rows have no manager,
      // so they get an empty string and sort to the bottom in ASC.
      accessorFn: (row) => {
        if (!row.reporting_manager_id) return "";
        return managerMap.get(row.reporting_manager_id)?.name ?? "";
      },
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-3"
        >
          Reporting Manager
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      // Two-line cell: name as the lead, emp_id as muted subtext. Matches
      // the subtitle pattern used in Daily Logs / Monthly Data row identifiers,
      // so the visual rhythm stays consistent across the app.
      //
      // Fallback chain:
      //   • Null FK (Tier-1)            → em-dash, muted.
      //   • FK set but lookup miss      → also em-dash. A custom_admin
      //     viewing the page may have the report in their scope but not the
      //     senior manager — rather than render a half-broken row, we
      //     dash it out the same way as a Tier-1.
      cell: ({ row }) => {
        const mgrId = row.original.reporting_manager_id;
        const manager = mgrId ? managerMap.get(mgrId) : null;
        if (!manager) {
          return <span className="text-sm text-muted-foreground">—</span>;
        }
        return (
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-sm font-medium truncate">{manager.name}</span>
            <span className="text-[11px] text-muted-foreground tabular-nums truncate">
              {manager.emp_id}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "date_of_joining",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-3"
        >
          Date of Joining
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      // Sort uses the raw YYYY-MM-DD string (lexicographic = chronological);
      // display reformats to dd/mm/yyyy. Defensive `formatDoj` returns null
      // for malformed input, so we render an em-dash instead of "13/45/...".
      cell: ({ row }) => {
        const raw = row.getValue("date_of_joining") as string | null;
        return (
          <span className="tabular-nums text-sm">{formatDoj(raw) ?? "—"}</span>
        );
      },
    },
    {
      accessorKey: "is_active",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-3"
        >
          Status
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const isActive = row.getValue("is_active") as boolean;
        return (
          <Badge
            variant="secondary"
            className={
              isActive
                ? "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800"
                : "bg-muted text-muted-foreground"
            }
          >
            {isActive ? "Active" : "Inactive"}
          </Badge>
        );
      },
      filterFn: (row, _columnId, value) => {
        if (value === "all") return true;
        return row.original.is_active === (value === "active");
      },
    },
  ];

  if (userRole === "super_admin") {
    columns.push({
      id: "actions",
      cell: ({ row }) => {
        const employee = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" className="h-8 w-8 p-0" />}
            >
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => actions.onEdit(employee)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => actions.onToggleStatus(employee)}
              >
                <ToggleRight className="mr-2 h-4 w-4" />
                {employee.is_active ? "Deactivate" : "Activate"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    });
  }

  return columns;
}
