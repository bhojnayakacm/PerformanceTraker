"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EmployeeMonthlyData } from "@/lib/types";
import { getInitials, getAvatarColor } from "@/lib/utils";
import { MetricCell } from "./metric-cell";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

export function getColumns(isCurrentMonth?: boolean): ColumnDef<EmployeeMonthlyData>[] {
  return [
    {
      id: "employee",
      accessorFn: (row) => row.employee.name,
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
        return (
          <div className="flex items-center gap-3">
            <div
              className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${getAvatarColor(name)}`}
            >
              {getInitials(name)}
            </div>
            <div>
              <div className="font-medium leading-tight">{name}</div>
              <div className="text-xs text-muted-foreground leading-tight">
                {row.original.employee.emp_id}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      id: "meetings",
      header: isCurrentMonth ? "Meetings (MTD)" : "Meetings",
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
      header: isCurrentMonth ? "Calls (MTD)" : "Calls",
      cell: ({ row }) => (
        <MetricCell
          target={row.original.target?.target_total_calls}
          actual={row.original.actual?.actual_calls}
        />
      ),
    },
    {
      id: "clientVisits",
      header: "Client Visits",
      cell: ({ row }) => (
        <MetricCell
          target={row.original.target?.target_client_visits}
          actual={row.original.actual?.actual_client_visits}
        />
      ),
    },
    {
      id: "dispatch",
      header: "Dispatch (SQFT)",
      cell: ({ row }) => (
        <MetricCell
          target={row.original.target?.target_dispatched_sqft}
          actual={row.original.actual?.actual_dispatched_sqft}
        />
      ),
    },
    {
      id: "tourDays",
      header: "Tour Days",
      cell: ({ row }) => (
        <MetricCell
          target={row.original.target?.target_tour_days}
          actual={row.original.actual?.actual_tour_days}
        />
      ),
    },
    {
      id: "costing",
      header: "Total Costing",
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
