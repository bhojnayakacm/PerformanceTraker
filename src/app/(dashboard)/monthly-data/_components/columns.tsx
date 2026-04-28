"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DRAG_HANDLE_COL_ID } from "@/components/data-table/sortable-table";
import type { EmployeeMonthlyData } from "@/lib/types";
import { getInitials, getAvatarColor } from "@/lib/utils";
import { MetricCell } from "./metric-cell";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

/** Builds an "achievement %" sort key from (target, actual). Rows missing
 * a target sort to the bottom of ASC. */
function achievementSortKey(target: number | null | undefined, actual: number | null | undefined): number {
  const t = Number(target) || 0;
  const a = Number(actual) || 0;
  if (t <= 0) return -1;
  return a / t;
}

/** Reusable sortable column header — same visual treatment everywhere. */
function SortHeader({
  label,
  toggle,
  isSorted,
}: {
  label: string;
  toggle: () => void;
  isSorted: false | "asc" | "desc";
}) {
  return (
    <Button
      variant="ghost"
      onClick={toggle}
      className="-ml-3"
    >
      {label}
      <ArrowUpDown className={`ml-2 h-4 w-4 ${isSorted ? "text-primary" : ""}`} />
    </Button>
  );
}

export function getColumns(isCurrentMonth?: boolean): ColumnDef<EmployeeMonthlyData>[] {
  return [
    {
      id: DRAG_HANDLE_COL_ID,
      header: () => null,
      cell: () => null,
      enableSorting: false,
      // Drag column has a fixed width — anchoring the next sticky column at
      // left-[40px] depends on this never changing.
      enableResizing: false,
      size: 40,
      minSize: 40,
      maxSize: 40,
    },
    {
      id: "employee",
      accessorFn: (row) => row.employee.name,
      size: 280,
      minSize: 200,
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-3"
        >
          Employee
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const name = row.original.employee.name;
        const { emp_id, location } = row.original.employee;
        return (
          <div className="flex items-center gap-3">
            <div
              className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${getAvatarColor(name)}`}
            >
              {getInitials(name)}
            </div>
            <div className="min-w-0">
              <div className="truncate font-medium leading-tight">{name}</div>
              <div className="truncate text-xs text-muted-foreground leading-tight">
                {emp_id}
                {location ? (
                  <>
                    <span aria-hidden className="mx-1.5 text-muted-foreground/60">
                      &bull;
                    </span>
                    {location}
                  </>
                ) : null}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      id: "meetings",
      size: 140,
      minSize: 100,
      // Sort by meetings achievement % so users can rank under-/over-performers.
      accessorFn: (row) => {
        const target = row.target?.target_total_meetings;
        const actual =
          (row.actual?.actual_architect_meetings ?? 0) +
          (row.actual?.actual_client_meetings ?? 0) +
          (row.actual?.actual_site_visits ?? 0);
        return achievementSortKey(target, actual);
      },
      header: ({ column }) => (
        <SortHeader
          label={isCurrentMonth ? "Meetings (MTD)" : "Meetings"}
          toggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          isSorted={column.getIsSorted()}
        />
      ),
      cell: ({ row }) => {
        const target = row.original.target?.target_total_meetings;
        const actual =
          (row.original.actual?.actual_architect_meetings ?? 0) +
          (row.original.actual?.actual_client_meetings ?? 0) +
          (row.original.actual?.actual_site_visits ?? 0);
        return <MetricCell target={target} actual={actual || null} />;
      },
    },
    {
      id: "calls",
      size: 120,
      minSize: 90,
      accessorFn: (row) =>
        achievementSortKey(
          row.target?.target_total_calls,
          row.actual?.actual_calls,
        ),
      header: ({ column }) => (
        <SortHeader
          label={isCurrentMonth ? "Calls (MTD)" : "Calls"}
          toggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          isSorted={column.getIsSorted()}
        />
      ),
      cell: ({ row }) => (
        <MetricCell
          target={row.original.target?.target_total_calls}
          actual={row.original.actual?.actual_calls}
        />
      ),
    },
    {
      id: "clientVisits",
      size: 140,
      minSize: 100,
      accessorFn: (row) =>
        achievementSortKey(
          row.target?.target_client_visits,
          row.actual?.actual_client_visits,
        ),
      header: ({ column }) => (
        <SortHeader
          label="Client Visits"
          toggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          isSorted={column.getIsSorted()}
        />
      ),
      cell: ({ row }) => (
        <MetricCell
          target={row.original.target?.target_client_visits}
          actual={row.original.actual?.actual_client_visits}
        />
      ),
    },
    {
      id: "dispatch",
      size: 180,
      minSize: 130,
      accessorFn: (row) =>
        achievementSortKey(
          row.target?.target_dispatched_sqft,
          row.actual?.actual_dispatched_sqft,
        ),
      header: ({ column }) => (
        <SortHeader
          label="Dispatched Qty (sqft.)"
          toggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          isSorted={column.getIsSorted()}
        />
      ),
      cell: ({ row }) => (
        <MetricCell
          target={row.original.target?.target_dispatched_sqft}
          actual={row.original.actual?.actual_dispatched_sqft}
        />
      ),
    },
    {
      id: "tourDays",
      size: 120,
      minSize: 90,
      accessorFn: (row) => {
        const tours = row.cityTours ?? [];
        const targetDays = tours.reduce((sum, t) => sum + t.target_days, 0);
        const actualDays = tours.reduce((sum, t) => sum + t.actual_days, 0);
        return achievementSortKey(targetDays, actualDays);
      },
      header: ({ column }) => (
        <SortHeader
          label="Tour Days"
          toggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          isSorted={column.getIsSorted()}
        />
      ),
      cell: ({ row }) => {
        const tours = row.original.cityTours ?? [];
        const targetDays = tours.reduce((sum, t) => sum + t.target_days, 0);
        const actualDays = tours.reduce((sum, t) => sum + t.actual_days, 0);
        return (
          <MetricCell
            target={targetDays || null}
            actual={actualDays || null}
          />
        );
      },
    },
    {
      id: "costing",
      size: 160,
      minSize: 120,
      accessorFn: (row) => row.actual?.total_costing ?? 0,
      header: ({ column }) => (
        <SortHeader
          label="Total Costing"
          toggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          isSorted={column.getIsSorted()}
        />
      ),
      cell: ({ row }) => {
        const total = row.original.actual?.total_costing;
        if (!total) {
          return <span className="text-sm text-muted-foreground">—</span>;
        }
        return (
          <span className="text-sm font-medium">{formatCurrency(total)}</span>
        );
      },
    },
  ];
}
