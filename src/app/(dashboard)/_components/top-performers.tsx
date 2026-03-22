import { Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PerformerData } from "../_lib/dashboard-helpers";

const RANK_COLORS = [
  "bg-amber-500 text-white",
  "bg-zinc-400 text-white",
  "bg-amber-700 text-white",
  "bg-muted text-muted-foreground",
  "bg-muted text-muted-foreground",
];

export function TopPerformers({
  performers,
}: {
  performers: PerformerData[];
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          Top Performers
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {performers.length === 0 ? (
          <div className="flex h-[260px] items-center justify-center text-muted-foreground text-sm">
            No performance data available
          </div>
        ) : (
          <div className="space-y-3">
            {performers.map((p, i) => {
              const barColor =
                p.achievementPct >= 90
                  ? "bg-emerald-500"
                  : p.achievementPct >= 70
                    ? "bg-amber-500"
                    : "bg-red-500";

              return (
                <div key={p.name} className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${RANK_COLORS[i]}`}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {p.name}
                        </p>
                        {p.location && (
                          <p className="text-xs text-muted-foreground truncate">
                            {p.location}
                          </p>
                        )}
                      </div>
                      <span
                        className={`text-sm font-semibold shrink-0 ${
                          p.achievementPct >= 90
                            ? "text-emerald-600"
                            : p.achievementPct >= 70
                              ? "text-amber-600"
                              : "text-red-600"
                        }`}
                      >
                        {p.achievementPct}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${barColor}`}
                        style={{
                          width: `${Math.min(p.achievementPct, 100)}%`,
                        }}
                      />
                    </div>
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
