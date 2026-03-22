"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { ReportRow } from "../_lib/report-types";
import { formatMonthYear } from "../_lib/report-types";

const col = createColumnHelper<ReportRow>();

function MetricPair({
  target,
  actual,
}: {
  target: number;
  actual: number;
}) {
  if (target === 0 && actual === 0) return <span className="text-muted-foreground">—</span>;

  const pct = target > 0 ? (actual / target) * 100 : 0;
  const color =
    target === 0
      ? "text-foreground"
      : pct >= 90
        ? "text-emerald-600"
        : pct >= 70
          ? "text-amber-600"
          : "text-red-600";

  return (
    <div className="text-right">
      <span className={`font-medium ${color}`}>{actual.toLocaleString()}</span>
      <span className="text-muted-foreground">
        {" "}
        / {target.toLocaleString()}
      </span>
    </div>
  );
}

function Currency({ value }: { value: number }) {
  if (value === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="text-right tabular-nums">
      ₹{value.toLocaleString("en-IN")}
    </span>
  );
}

export const columns = [
  col.accessor("employeeName", {
    header: "Employee",
    cell: (info) => (
      <div className="min-w-[120px]">
        <p className="font-medium">{info.getValue()}</p>
        <p className="text-xs text-muted-foreground">{info.row.original.empId}</p>
      </div>
    ),
  }),
  col.accessor("location", {
    header: "Location",
    cell: (info) => (
      <span className="text-sm">{info.getValue() || "—"}</span>
    ),
  }),
  col.accessor("month", {
    header: "Period",
    cell: (info) => (
      <span className="text-sm whitespace-nowrap">
        {formatMonthYear(info.getValue(), info.row.original.year)}
      </span>
    ),
  }),
  col.display({
    id: "meetings",
    header: () => <div className="text-right">Meetings</div>,
    cell: ({ row }) => (
      <MetricPair
        target={row.original.targetMeetings}
        actual={row.original.actualMeetings}
      />
    ),
  }),
  col.display({
    id: "calls",
    header: () => <div className="text-right">Calls</div>,
    cell: ({ row }) => (
      <MetricPair
        target={row.original.targetCalls}
        actual={row.original.actualCalls}
      />
    ),
  }),
  col.display({
    id: "clientVisits",
    header: () => <div className="text-right">Client Visits</div>,
    cell: ({ row }) => (
      <MetricPair
        target={row.original.targetClientVisits}
        actual={row.original.actualClientVisits}
      />
    ),
  }),
  col.display({
    id: "dispatchSqft",
    header: () => <div className="text-right">Dispatch SQFT</div>,
    cell: ({ row }) => (
      <MetricPair
        target={row.original.targetDispatchSqft}
        actual={row.original.actualDispatchSqft}
      />
    ),
  }),
  col.display({
    id: "tourDays",
    header: () => <div className="text-right">Tour Days</div>,
    cell: ({ row }) => (
      <MetricPair
        target={row.original.targetTourDays}
        actual={row.original.actualTourDays}
      />
    ),
  }),
  col.accessor("actualConversions", {
    header: () => <div className="text-right">Conversions</div>,
    cell: (info) => (
      <div className="text-right tabular-nums font-medium">
        {info.getValue() || <span className="text-muted-foreground">—</span>}
      </div>
    ),
  }),
  col.accessor("totalCosting", {
    header: () => <div className="text-right">Total Costing</div>,
    cell: (info) => (
      <div className="text-right">
        <Currency value={info.getValue()} />
      </div>
    ),
  }),
];
