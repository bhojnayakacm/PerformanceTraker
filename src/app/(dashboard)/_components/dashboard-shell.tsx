"use client";

import { MonthSelector } from "@/components/month-selector";
import { KpiCards } from "./kpi-cards";
import { TargetActualChart } from "./target-actual-chart";
import { CostBreakdownChart } from "./cost-breakdown-chart";
import { TopPerformers } from "./top-performers";
import { MetricOverview } from "./metric-overview";
import type {
  KpiData,
  BarChartItem,
  PerformerData,
  MetricCompletion,
} from "../_lib/dashboard-helpers";

type Props = {
  month: number;
  year: number;
  kpis: KpiData;
  barData: BarChartItem[];
  performers: PerformerData[];
  metricCompletions: MetricCompletion[];
};

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

export function DashboardShell({
  month,
  year,
  kpis,
  barData,
  performers,
  metricCompletions,
}: Props) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Performance overview for {MONTHS[month - 1]} {year}
          </p>
        </div>
        <MonthSelector month={month} year={year} basePath="/" />
      </div>

      {/* KPI Cards */}
      <KpiCards kpis={kpis} />

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <TargetActualChart data={barData} />
        <CostBreakdownChart breakdown={kpis.costBreakdown} />
      </div>

      {/* Bottom Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <TopPerformers performers={performers} />
        <MetricOverview completions={metricCompletions} />
      </div>
    </div>
  );
}
