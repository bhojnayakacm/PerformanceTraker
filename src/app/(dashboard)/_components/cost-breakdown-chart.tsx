"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "../_lib/dashboard-helpers";
import type { KpiData } from "../_lib/dashboard-helpers";

const COLORS = [
  "hsl(220, 70%, 55%)",
  "hsl(160, 60%, 45%)",
  "hsl(35, 90%, 55%)",
  "hsl(340, 65%, 55%)",
];

export function CostBreakdownChart({
  breakdown,
}: {
  breakdown: KpiData["costBreakdown"];
}) {
  const data = [
    { name: "Salary", value: breakdown.salary },
    { name: "TA/DA", value: breakdown.tada },
    { name: "Incentive", value: breakdown.incentive },
    { name: "Sales Promo", value: breakdown.salesPromotion },
  ].filter((d) => d.value > 0);

  const isEmpty = data.length === 0;

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Cost Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {isEmpty ? (
          <div className="flex h-[300px] items-center justify-center text-muted-foreground text-sm">
            No costing data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={110}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => `₹${formatNumber(Number(value))}`}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid hsl(var(--border))",
                  backgroundColor: "hsl(var(--popover))",
                  color: "hsl(var(--popover-foreground))",
                  fontSize: "13px",
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: "13px" }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
