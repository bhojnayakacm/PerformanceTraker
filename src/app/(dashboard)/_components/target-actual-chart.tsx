"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BarChartItem } from "../_lib/dashboard-helpers";

export function TargetActualChart({ data }: { data: BarChartItem[] }) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Target vs Actual</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={data}
            margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="metric"
              tick={{ fontSize: 12 }}
              className="fill-muted-foreground"
            />
            <YAxis
              tick={{ fontSize: 12 }}
              className="fill-muted-foreground"
            />
            <Tooltip
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
            <Bar
              dataKey="target"
              name="Target"
              fill="hsl(var(--muted-foreground))"
              radius={[4, 4, 0, 0]}
              opacity={0.4}
            />
            <Bar
              dataKey="actual"
              name="Actual"
              fill="hsl(var(--primary))"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
