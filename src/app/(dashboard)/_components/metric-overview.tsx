import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "../_lib/dashboard-helpers";
import type { MetricCompletion } from "../_lib/dashboard-helpers";

export function MetricOverview({
  completions,
}: {
  completions: MetricCompletion[];
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          Metric Completion
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {completions.every((c) => c.target === 0) ? (
          <div className="flex h-[260px] items-center justify-center text-muted-foreground text-sm">
            No targets set for this month
          </div>
        ) : (
          <div className="space-y-5">
            {completions.map((c) => {
              const barColor =
                c.pct >= 90
                  ? "bg-emerald-500"
                  : c.pct >= 70
                    ? "bg-amber-500"
                    : "bg-red-500";

              const textColor =
                c.pct >= 90
                  ? "text-emerald-600"
                  : c.pct >= 70
                    ? "text-amber-600"
                    : "text-red-600";

              return (
                <div key={c.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{c.label}</span>
                    <span className={`font-semibold ${textColor}`}>
                      {c.target > 0 ? `${c.pct}%` : "—"}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${barColor}`}
                      style={{ width: `${Math.min(c.pct, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {formatNumber(c.actual)} / {formatNumber(c.target)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
