import type { Employee, MonthlyTarget, MonthlyActual } from "@/lib/types";

export type KpiData = {
  activeEmployees: number;
  totalMeetingsActual: number;
  totalMeetingsTarget: number;
  totalCallsActual: number;
  totalCallsTarget: number;
  totalClientVisitsActual: number;
  totalClientVisitsTarget: number;
  totalDispatchSqftActual: number;
  totalDispatchSqftTarget: number;
  totalCosting: number;
  costBreakdown: {
    salary: number;
    tada: number;
    incentive: number;
    salesPromotion: number;
  };
};

export type PerformerData = {
  name: string;
  location: string | null;
  achievementPct: number;
};

export type MetricCompletion = {
  label: string;
  actual: number;
  target: number;
  pct: number;
};

export type BarChartItem = {
  metric: string;
  target: number;
  actual: number;
};

export function computeKpis(
  employees: Employee[],
  targets: MonthlyTarget[],
  actuals: MonthlyActual[]
): KpiData {
  const targetMap = new Map(targets.map((t) => [t.employee_id, t]));
  const actualMap = new Map(actuals.map((a) => [a.employee_id, a]));

  let totalMeetingsActual = 0;
  let totalMeetingsTarget = 0;
  let totalCallsActual = 0;
  let totalCallsTarget = 0;
  let totalClientVisitsActual = 0;
  let totalClientVisitsTarget = 0;
  let totalDispatchSqftActual = 0;
  let totalDispatchSqftTarget = 0;
  let salary = 0;
  let tada = 0;
  let incentive = 0;
  let salesPromotion = 0;

  for (const emp of employees) {
    const t = targetMap.get(emp.id);
    const a = actualMap.get(emp.id);

    if (t) {
      totalMeetingsTarget += t.target_total_meetings ?? 0;
      totalCallsTarget += t.target_total_calls ?? 0;
      totalClientVisitsTarget += t.target_client_visits ?? 0;
      totalDispatchSqftTarget += t.target_dispatched_sqft ?? 0;
    }

    if (a) {
      totalMeetingsActual +=
        (a.actual_architect_meetings ?? 0) +
        (a.actual_client_meetings ?? 0) +
        (a.actual_site_visits ?? 0);
      totalCallsActual += a.actual_calls ?? 0;
      totalClientVisitsActual += a.actual_client_visits ?? 0;
      totalDispatchSqftActual += a.actual_dispatched_sqft ?? 0;
      salary += a.salary ?? 0;
      tada += a.tada ?? 0;
      incentive += a.incentive ?? 0;
      salesPromotion += a.sales_promotion ?? 0;
    }
  }

  return {
    activeEmployees: employees.length,
    totalMeetingsActual,
    totalMeetingsTarget,
    totalCallsActual,
    totalCallsTarget,
    totalClientVisitsActual,
    totalClientVisitsTarget,
    totalDispatchSqftActual,
    totalDispatchSqftTarget,
    totalCosting: salary + tada + incentive + salesPromotion,
    costBreakdown: { salary, tada, incentive, salesPromotion },
  };
}

export function computePerformers(
  employees: Employee[],
  targets: MonthlyTarget[],
  actuals: MonthlyActual[]
): PerformerData[] {
  const targetMap = new Map(targets.map((t) => [t.employee_id, t]));
  const actualMap = new Map(actuals.map((a) => [a.employee_id, a]));

  const performers: PerformerData[] = [];

  for (const emp of employees) {
    const t = targetMap.get(emp.id);
    const a = actualMap.get(emp.id);
    if (!t || !a) continue;

    const metrics = [
      {
        actual:
          (a.actual_architect_meetings ?? 0) +
          (a.actual_client_meetings ?? 0) +
          (a.actual_site_visits ?? 0),
        target: t.target_total_meetings ?? 0,
      },
      { actual: a.actual_calls ?? 0, target: t.target_total_calls ?? 0 },
      {
        actual: a.actual_client_visits ?? 0,
        target: t.target_client_visits ?? 0,
      },
      {
        actual: a.actual_dispatched_sqft ?? 0,
        target: t.target_dispatched_sqft ?? 0,
      },
    ];

    const validMetrics = metrics.filter((m) => m.target > 0);
    if (validMetrics.length === 0) continue;

    const avgPct =
      validMetrics.reduce(
        (sum, m) => sum + Math.min((m.actual / m.target) * 100, 150),
        0
      ) / validMetrics.length;

    performers.push({
      name: emp.name,
      location: emp.location,
      achievementPct: Math.round(avgPct),
    });
  }

  return performers.sort((a, b) => b.achievementPct - a.achievementPct);
}

export function computeBarData(kpis: KpiData): BarChartItem[] {
  return [
    {
      metric: "Meetings",
      target: kpis.totalMeetingsTarget,
      actual: kpis.totalMeetingsActual,
    },
    {
      metric: "Calls",
      target: kpis.totalCallsTarget,
      actual: kpis.totalCallsActual,
    },
    {
      metric: "Client Visits",
      target: kpis.totalClientVisitsTarget,
      actual: kpis.totalClientVisitsActual,
    },
    {
      metric: "Dispatch (sqft)",
      target: kpis.totalDispatchSqftTarget,
      actual: kpis.totalDispatchSqftActual,
    },
  ];
}

export function computeMetricCompletions(kpis: KpiData): MetricCompletion[] {
  const items = [
    {
      label: "Meetings",
      actual: kpis.totalMeetingsActual,
      target: kpis.totalMeetingsTarget,
    },
    {
      label: "Calls",
      actual: kpis.totalCallsActual,
      target: kpis.totalCallsTarget,
    },
    {
      label: "Client Visits",
      actual: kpis.totalClientVisitsActual,
      target: kpis.totalClientVisitsTarget,
    },
    {
      label: "Dispatch SQFT",
      actual: kpis.totalDispatchSqftActual,
      target: kpis.totalDispatchSqftTarget,
    },
  ];

  return items.map((item) => ({
    ...item,
    pct: item.target > 0 ? Math.round((item.actual / item.target) * 100) : 0,
  }));
}

export function pct(actual: number, target: number): number {
  return target > 0 ? Math.round((actual / target) * 100) : 0;
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
