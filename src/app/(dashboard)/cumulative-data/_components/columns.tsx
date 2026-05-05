"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EmployeeCumulativeData } from "@/lib/types";
import { getInitials, getAvatarColor } from "@/lib/utils";
import { CumulativeMetricCell } from "./cumulative-metric-cell";

/** Same achievement-key trick as Monthly Data — rows missing a target
 *  sort to the bottom of ASC so they don't masquerade as best performers
 *  by virtue of having no goalpost. */
function achievementKey(target: number, actual: number): number {
  if (target <= 0) return -1;
  return actual / target;
}

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
    <Button variant="ghost" onClick={toggle} className="-ml-3">
      {label}
      <ArrowUpDown
        className={`ml-2 h-4 w-4 ${isSorted ? "text-primary" : ""}`}
      />
    </Button>
  );
}

export function getColumns(): ColumnDef<EmployeeCumulativeData>[] {
  return [
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
        const { name, emp_id, location } = row.original.employee;
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
      id: "clientVisits",
      size: 170,
      minSize: 130,
      accessorFn: (row) =>
        achievementKey(row.clientVisits.target, row.clientVisits.actual),
      header: ({ column }) => (
        <SortHeader
          label="Client Visits"
          toggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          isSorted={column.getIsSorted()}
        />
      ),
      cell: ({ row }) => (
        <CumulativeMetricCell
          actual={row.original.clientVisits.actual}
          target={row.original.clientVisits.target}
          numberOfMonths={row.original.numberOfMonths}
        />
      ),
    },
    {
      id: "dispatch",
      size: 200,
      minSize: 150,
      accessorFn: (row) =>
        achievementKey(row.dispatchedSqft.target, row.dispatchedSqft.actual),
      header: ({ column }) => (
        <SortHeader
          label="Dispatched Qty (sqft.)"
          toggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          isSorted={column.getIsSorted()}
        />
      ),
      cell: ({ row }) => (
        <CumulativeMetricCell
          actual={row.original.dispatchedSqft.actual}
          target={row.original.dispatchedSqft.target}
          numberOfMonths={row.original.numberOfMonths}
        />
      ),
    },
    {
      id: "tourDays",
      size: 150,
      minSize: 110,
      accessorFn: (row) => achievementKey(row.tourDays.target, row.tourDays.actual),
      header: ({ column }) => (
        <SortHeader
          label="Tour Days"
          toggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          isSorted={column.getIsSorted()}
        />
      ),
      cell: ({ row }) => (
        <CumulativeMetricCell
          actual={row.original.tourDays.actual}
          target={row.original.tourDays.target}
          numberOfMonths={row.original.numberOfMonths}
        />
      ),
    },
    {
      id: "costing",
      size: 180,
      minSize: 140,
      accessorFn: (row) => row.totalCosting,
      header: ({ column }) => (
        <SortHeader
          label="Total Costing"
          toggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
          isSorted={column.getIsSorted()}
        />
      ),
      cell: ({ row }) => (
        <CumulativeMetricCell
          actual={row.original.totalCosting}
          numberOfMonths={row.original.numberOfMonths}
          currency
        />
      ),
    },
  ];
}
